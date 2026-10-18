import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAILS, makeClient, query, setupTestServer } from './helpers/testEnv.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { createHash } from 'node:crypto';

const ctx = setupTestServer();
const api = makeClient(ctx);

describe('login', () => {
  test('valid credentials set a secure session cookie and return the user without secrets', async () => {
    const res = await api.request('POST', '/auth/login', {
      body: { email: EMAILS.studentA, password: 'DemoPass!2026' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, EMAILS.studentA);
    assert.equal(res.body.data.user.role, 'student');
    assert.equal(res.body.data.user.office.code, 'DEMO-A');
    assert.ok(!JSON.stringify(res.body).includes('password'), 'response must not mention password fields');

    const cookie = res.setCookie[0];
    assert.match(cookie, /^dt_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  test('email is case-insensitive and trimmed', async () => {
    const res = await api.request('POST', '/auth/login', {
      body: { email: `  ${EMAILS.studentA.toUpperCase()} `, password: 'DemoPass!2026' },
    });
    assert.equal(res.status, 200);
  });

  test('wrong password and unknown email give the same generic error', async () => {
    const wrong = await api.request('POST', '/auth/login', { body: { email: EMAILS.studentA, password: 'nope-nope-nope' } });
    const unknown = await api.request('POST', '/auth/login', { body: { email: 'nobody@demo.dutytrace.test', password: 'nope-nope-nope' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    assert.equal(wrong.setCookie.length, 0);
  });

  test('invalid input is rejected with field errors', async () => {
    const res = await api.request('POST', '/auth/login', { body: { email: 'not-an-email' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.email);
    assert.ok(res.body.error.details.password);
  });

  test('malformed JSON returns 400, not 500', async () => {
    const res = await fetch(`${ctx.base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad',
    });
    assert.equal(res.status, 400);
  });

  test('disabled accounts cannot sign in', async () => {
    await query("UPDATE users SET status = 'disabled' WHERE email = $1", [EMAILS.studentA2]);
    const res = await api.request('POST', '/auth/login', { body: { email: EMAILS.studentA2, password: 'DemoPass!2026' } });
    assert.equal(res.status, 401);
    await query("UPDATE users SET status = 'active' WHERE email = $1", [EMAILS.studentA2]);
  });

  test('repeated failures lock the account, even for the correct password', async () => {
    for (let i = 0; i < env.maxFailedLogins; i += 1) {
      const r = await api.request('POST', '/auth/login', { body: { email: EMAILS.studentB, password: 'wrong-wrong-1' } });
      assert.equal(r.status, 401);
    }
    const correct = await api.request('POST', '/auth/login', { body: { email: EMAILS.studentB, password: 'DemoPass!2026' } });
    assert.equal(correct.status, 401, 'locked account must reject the right password');

    // Lock expires -> works again.
    await query("UPDATE users SET locked_until = now() - interval '1 minute' WHERE email = $1", [EMAILS.studentB]);
    const after = await api.request('POST', '/auth/login', { body: { email: EMAILS.studentB, password: 'DemoPass!2026' } });
    assert.equal(after.status, 200);
  });
});

describe('sessions', () => {
  test('/auth/me requires a session', async () => {
    assert.equal((await api.get('/auth/me')).status, 401);
    assert.equal((await api.get('/auth/me', { cookie: 'dt_session=garbage' })).status, 401);
  });

  test('/auth/me returns the logged-in user', async () => {
    const cookie = await api.login(EMAILS.supervisorA);
    const res = await api.get('/auth/me', { cookie });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'supervisor');
  });

  test('only a hash of the session token is stored in the database', async () => {
    const cookie = await api.login(EMAILS.admin);
    const token = cookie.split('=')[1];
    const { rows } = await query('SELECT token_hash FROM sessions WHERE token_hash = $1', [token]);
    assert.equal(rows.length, 0, 'raw token must not be in the database');
  });

  test('logout revokes the session on the server', async () => {
    const cookie = await api.login(EMAILS.studentA);
    assert.equal((await api.get('/auth/me', { cookie })).status, 200);
    const out = await api.post('/auth/logout', { cookie });
    assert.equal(out.status, 200);
    // Replaying the old cookie must fail: it is revoked, not merely deleted client-side.
    assert.equal((await api.get('/auth/me', { cookie })).status, 401);
  });

  test('expired sessions are rejected', async () => {
    const cookie = await api.login(EMAILS.studentA);
    await query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    assert.equal((await api.get('/auth/me', { cookie })).status, 401);
  });

  test('state-changing requests from another origin are rejected', async () => {
    const res = await api.request('POST', '/auth/login', {
      body: { email: EMAILS.studentA, password: 'DemoPass!2026' },
      headers: { origin: 'http://evil.example' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'BAD_ORIGIN');
  });
});

describe('password reset token verification', () => {
  test('verifies a token from a POST body, disables caching, and does not accept tokens in GET URLs', async () => {
    const token = 'test-only-reset-token-not-a-real-secret';
    const hash = createHash('sha256').update(token).digest('hex');
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       SELECT id, $1, now() + interval '10 minutes' FROM users WHERE email = $2`,
      [hash, EMAILS.studentA],
    );

    const verified = await api.post('/auth/reset-password/verify', { body: { token } });
    assert.equal(verified.status, 200);
    assert.match(verified.headers?.get('cache-control') ?? '', /no-store/i);
    assert.equal(verified.body.data.valid, true);
    assert.match(verified.body.data.maskedEmail, /\*/);

    const legacy = await api.get(`/auth/reset-password?token=${encodeURIComponent(token)}`);
    assert.equal(legacy.status, 404);
  });
});

describe('audit trail', () => {
  test('logins and logouts are recorded', async () => {
    const { rows: before } = await query("SELECT count(*)::int AS n FROM audit_logs WHERE action IN ('auth.login','auth.logout')");
    const cookie = await api.login(EMAILS.studentA);
    await api.post('/auth/logout', { cookie });
    const { rows: after } = await query("SELECT count(*)::int AS n FROM audit_logs WHERE action IN ('auth.login','auth.logout')");
    assert.equal(after[0].n - before[0].n, 2);
  });

  test('audit rows cannot be updated, deleted or truncated', async () => {
    await assert.rejects(query("UPDATE audit_logs SET action = 'tampered'"), /append-only/);
    await assert.rejects(query('DELETE FROM audit_logs'), /append-only/);
    await assert.rejects(query('TRUNCATE audit_logs'), /append-only/);
  });
});

describe('rate limiting', () => {
  test('too many login attempts from one IP return 429', async () => {
    const server = await new Promise((resolve) => {
      const s = createApp({ loginRateLimitMax: 3 }).listen(0, () => resolve(s));
    });
    try {
      const url = `http://localhost:${server.address().port}/api/auth/login`;
      const statuses = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'nobody@demo.dutytrace.test', password: 'x' }),
        });
        statuses.push(r.status);
      }
      assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
