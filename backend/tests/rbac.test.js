import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAILS, makeClient, query, setupTestServer } from './helpers/testEnv.js';

const cookies = {};
const ids = {};
const officeIds = {};

// Forward reference: `api` needs ctx, and ctx's ready-hook needs `api`.
let api;
const ctx = setupTestServer({}, async () => {
  for (const [key, email] of Object.entries(EMAILS)) cookies[key] = await api.login(email);
  const users = await query('SELECT id, email FROM users');
  for (const [key, email] of Object.entries(EMAILS)) ids[key] = users.rows.find((u) => u.email === email).id;
  const offices = await query('SELECT id, code FROM offices');
  officeIds.A = offices.rows.find((o) => o.code === 'DEMO-A').id;
  officeIds.B = offices.rows.find((o) => o.code === 'DEMO-B').id;
});
api = makeClient(ctx);

describe('unauthenticated access', () => {
  for (const [method, path] of [
    ['GET', '/users'], ['POST', '/users'], ['GET', '/offices'], ['POST', '/offices'],
    ['GET', '/users/00000000-0000-4000-8000-000000000000'],
  ]) {
    test(`${method} ${path} -> 401`, async () => {
      assert.equal((await api.request(method, path, { body: method === 'POST' ? {} : undefined })).status, 401);
    });
  }
});

describe('student permissions', () => {
  test('cannot list users, create users, list offices or create offices', async () => {
    const c = cookies.studentA;
    assert.equal((await api.get('/users', { cookie: c })).status, 403);
    assert.equal((await api.post('/users', { cookie: c, body: {} })).status, 403);
    assert.equal((await api.get('/offices', { cookie: c })).status, 403);
    assert.equal((await api.post('/offices', { cookie: c, body: { code: 'X', name: 'X' } })).status, 403);
  });

  test('cannot read the assistants list of any office', async () => {
    assert.equal((await api.get(`/offices/${officeIds.A}/assistants`, { cookie: cookies.studentA })).status, 403);
  });

  test('can read their own record but not someone else\'s (changing the id in the URL)', async () => {
    const own = await api.get(`/users/${ids.studentA}`, { cookie: cookies.studentA });
    assert.equal(own.status, 200);
    assert.equal(own.body.data.user.email, EMAILS.studentA);
    const other = await api.get(`/users/${ids.studentA2}`, { cookie: cookies.studentA });
    assert.equal(other.status, 403);
  });

  test('cannot promote themselves or edit anyone', async () => {
    const self = await api.request('PATCH', `/users/${ids.studentA}`, { cookie: cookies.studentA, body: { role: 'admin' } });
    assert.equal(self.status, 403);
    const { rows } = await query('SELECT role FROM users WHERE id = $1', [ids.studentA]);
    assert.equal(rows[0].role, 'student');
    const assign = await api.request('PUT', `/users/${ids.studentA}/assignment`, { cookie: cookies.studentA, body: { officeId: officeIds.B } });
    assert.equal(assign.status, 403);
  });
});

describe('supervisor permissions', () => {
  test('cannot manage users', async () => {
    const c = cookies.supervisorA;
    assert.equal((await api.get('/users', { cookie: c })).status, 403);
    assert.equal((await api.request('PATCH', `/users/${ids.studentA}`, { cookie: c, body: { status: 'disabled' } })).status, 403);
    assert.equal((await api.get(`/users/${ids.studentA}`, { cookie: c })).status, 403);
  });

  test('sees only their own office', async () => {
    const res = await api.get('/offices', { cookie: cookies.supervisorA });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.offices.map((o) => o.code), ['DEMO-A']);
  });

  test('can list assistants of their own office only', async () => {
    const own = await api.get(`/offices/${officeIds.A}/assistants`, { cookie: cookies.supervisorA });
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.data.assistants.map((a) => a.email).sort(), [EMAILS.studentA, EMAILS.studentA2].sort());

    const other = await api.get(`/offices/${officeIds.B}/assistants`, { cookie: cookies.supervisorA });
    assert.equal(other.status, 403);
  });

  test('cannot create offices', async () => {
    assert.equal((await api.post('/offices', { cookie: cookies.supervisorA, body: { code: 'Z', name: 'Z' } })).status, 403);
  });
});

describe('administrator permissions', () => {
  test('can list all users and offices without password hashes', async () => {
    const users = await api.get('/users', { cookie: cookies.admin });
    assert.equal(users.status, 200);
    assert.equal(users.body.data.users.length, 6);
    assert.ok(!JSON.stringify(users.body).toLowerCase().includes('hash'));
    const offices = await api.get('/offices', { cookie: cookies.admin });
    assert.equal(offices.body.data.offices.length, 2);
  });

  test('can create a user; the new user can sign in; duplicates are rejected', async () => {
    const body = { email: 'New.Person@demo.dutytrace.test', fullName: 'New Person', role: 'student', password: 'a-long-password-1', officeId: officeIds.B };
    const created = await api.post('/users', { cookie: cookies.admin, body });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.email, 'new.person@demo.dutytrace.test');
    assert.equal(created.body.data.user.office.code, 'DEMO-B');

    const login = await api.request('POST', '/auth/login', { body: { email: body.email, password: body.password } });
    assert.equal(login.status, 200);

    const dup = await api.post('/users', { cookie: cookies.admin, body });
    assert.equal(dup.status, 409);
  });

  test('rejects weak passwords, bad roles and admin-with-office', async () => {
    const base = { email: 'x@demo.dutytrace.test', fullName: 'X', role: 'student', password: 'long-enough-pw' };
    assert.equal((await api.post('/users', { cookie: cookies.admin, body: { ...base, password: 'short' } })).status, 400);
    assert.equal((await api.post('/users', { cookie: cookies.admin, body: { ...base, role: 'superuser' } })).status, 400);
    assert.equal((await api.post('/users', { cookie: cookies.admin, body: { ...base, role: 'admin', officeId: officeIds.A } })).status, 400);
  });

  test('invalid ids return 400 and unknown ids return 404', async () => {
    assert.equal((await api.get('/users/not-a-uuid', { cookie: cookies.admin })).status, 400);
    assert.equal((await api.get('/users/00000000-0000-4000-8000-000000000000', { cookie: cookies.admin })).status, 404);
  });

  test('cannot demote or disable their own account', async () => {
    const demote = await api.request('PATCH', `/users/${ids.admin}`, { cookie: cookies.admin, body: { role: 'student' } });
    assert.equal(demote.status, 400);
    const disable = await api.request('PATCH', `/users/${ids.admin}`, { cookie: cookies.admin, body: { status: 'disabled' } });
    assert.equal(disable.status, 400);
  });

  test('disabling a user signs them out immediately', async () => {
    const victim = await api.login(EMAILS.studentA2);
    assert.equal((await api.get('/auth/me', { cookie: victim })).status, 200);
    const res = await api.request('PATCH', `/users/${ids.studentA2}`, { cookie: cookies.admin, body: { status: 'disabled' } });
    assert.equal(res.status, 200);
    assert.equal((await api.get('/auth/me', { cookie: victim })).status, 401);
    await api.request('PATCH', `/users/${ids.studentA2}`, { cookie: cookies.admin, body: { status: 'active' } });
  });

  test('role changes take effect on the existing session, and are audited with before/after', async () => {
    const session = await api.login(EMAILS.studentB);
    assert.equal((await api.get('/users', { cookie: session })).status, 403);

    await api.request('PATCH', `/users/${ids.studentB}`, { cookie: cookies.admin, body: { role: 'student', fullName: 'Renamed Student' } });
    const promote = await api.request('PATCH', `/users/${ids.studentB}`, { cookie: cookies.admin, body: { role: 'supervisor' } });
    assert.equal(promote.status, 200);
    // Same cookie, new role, no re-login needed.
    assert.equal((await api.get('/offices', { cookie: session })).status, 200);
    assert.equal((await api.get('/users', { cookie: session })).status, 403, 'supervisor is still not admin');

    const { rows } = await query("SELECT before_data, after_data FROM audit_logs WHERE action = 'user.update' AND target_id = $1 ORDER BY id DESC LIMIT 1", [ids.studentB]);
    assert.equal(rows[0].before_data.role, 'student');
    assert.equal(rows[0].after_data.role, 'supervisor');
    assert.ok(!JSON.stringify(rows[0]).includes('password'));

    await api.request('PATCH', `/users/${ids.studentB}`, { cookie: cookies.admin, body: { role: 'student' } });
  });

  test('moving a student between offices changes what supervisors can see, and keeps history', async () => {
    const move = await api.request('PUT', `/users/${ids.studentA2}/assignment`, { cookie: cookies.admin, body: { officeId: officeIds.B } });
    assert.equal(move.status, 200);
    assert.equal(move.body.data.user.office.code, 'DEMO-B');

    const a = await api.get(`/offices/${officeIds.A}/assistants`, { cookie: cookies.supervisorA });
    assert.ok(!a.body.data.assistants.some((x) => x.id === ids.studentA2));
    const b = await api.get(`/offices/${officeIds.B}/assistants`, { cookie: cookies.supervisorB });
    assert.ok(b.body.data.assistants.some((x) => x.id === ids.studentA2));

    const history = await query('SELECT count(*)::int AS n FROM duty_assignments WHERE user_id = $1', [ids.studentA2]);
    assert.equal(history.rows[0].n, 2, 'old assignment is ended, not deleted');
    const current = await query('SELECT count(*)::int AS n FROM duty_assignments WHERE user_id = $1 AND ends_on IS NULL', [ids.studentA2]);
    assert.equal(current.rows[0].n, 1);
  });

  test('the database allows only one current assignment per user', async () => {
    await assert.rejects(
      query('INSERT INTO duty_assignments (user_id, office_id) VALUES ($1, $2)', [ids.studentA, officeIds.B]),
      /duty_assignments_one_current_per_user/,
    );
  });

  test('can create an office; duplicate codes are rejected (case-insensitive)', async () => {
    const ok = await api.post('/offices', { cookie: cookies.admin, body: { code: 'demo-c', name: 'Sample Office C (demo)' } });
    assert.equal(ok.status, 201);
    const dup = await api.post('/offices', { cookie: cookies.admin, body: { code: 'DEMO-C', name: 'Again' } });
    assert.equal(dup.status, 409);
  });
});
