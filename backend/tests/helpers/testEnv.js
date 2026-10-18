import { after, before } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '../../src/config/env.js';
import { closePool, getPool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { DEMO_PASSWORD, seed } from '../fixtures/demoSeed.js';
import { createApp } from '../../src/app.js';

export { DEMO_PASSWORD, query };

// Point the app at the TEST database and refuse to run if that looks unsafe,
// because these tests wipe the whole schema.
function useTestDatabase() {
  const url = env.testDatabaseUrl;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see backend/.env.example).');
  if (url === env.databaseUrl) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Test database name must contain "test" (got "${dbName}").`);
  env.databaseUrl = url;
  env.databaseSsl = env.testDatabaseSsl;
  env.databaseSslCa = env.testDatabaseSslCa;
}

async function resetDatabase() {
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations({ log: () => {} });
  await seed({ log: () => {} });
}

// Registers before/after hooks: fresh seeded database + a running API server.
// `onReady` runs once the server is up (e.g. to log in test users).
export function setupTestServer(appOptions = {}, onReady) {
  const ctx = { base: '', uploadDir: '' };
  let server;

  before(async () => {
    useTestDatabase();
    // Every test file stores uploaded documents in its own throw-away directory.
    ctx.uploadDir = await mkdtemp(path.join(os.tmpdir(), 'dutytrace-uploads-'));
    env.uploadDir = ctx.uploadDir;
    await resetDatabase();
    server = await new Promise((resolve) => {
      const s = createApp(appOptions).listen(0, () => resolve(s));
    });
    ctx.base = `http://localhost:${server.address().port}`;
    if (onReady) await onReady();
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closePool();
    if (ctx.uploadDir) await rm(ctx.uploadDir, { recursive: true, force: true });
  });

  return ctx;
}

// Minimal HTTP helper with manual cookie handling.
export function makeClient(ctx) {
  const request = async (method, path, { cookie, body, headers = {} } = {}) => {
    const res = await fetch(`${ctx.base}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, headers: res.headers, setCookie: res.headers.getSetCookie() };
  };

  // Log in and return the "name=value" cookie string.
  const login = async (email, password = DEMO_PASSWORD) => {
    const res = await request('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
    return res.setCookie[0].split(';')[0];
  };

  // Raw request (no JSON handling): used for file uploads and downloads.
  const raw = async (method, p, { cookie, body, headers = {} } = {}) => {
    const res = await fetch(`${ctx.base}/api${p}`, { method, headers: { ...(cookie ? { cookie } : {}), ...headers }, body });
    return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  };
  // Upload: the request body IS the file; the name travels in ?filename=
  const upload = async (p, buffer, { cookie, filename = 'file.pdf', query = '' } = {}) => {
    const url = `${p}${p.includes('?') ? '&' : '?'}filename=${encodeURIComponent(filename)}${query}`;
    const res = await raw('POST', url, { cookie, body: buffer, headers: { 'content-type': 'application/octet-stream' } });
    let body = null;
    try { body = JSON.parse(res.buffer.toString('utf8')); } catch { /* not JSON */ }
    return { status: res.status, body };
  };

  return {
    request, login, raw, upload,
    get: (p, o) => request('GET', p, o), post: (p, o) => request('POST', p, o), put: (p, o) => request('PUT', p, o),
  };
}

export const EMAILS = {
  admin: 'admin@demo.dutytrace.test',
  supervisorA: 'supervisor@demo.dutytrace.test',
  supervisorB: 'supervisor2@demo.dutytrace.test',
  studentA: 'student@demo.dutytrace.test',
  studentA2: 'student2@demo.dutytrace.test',
  studentB: 'student3@demo.dutytrace.test',
};

// Logs in every seeded user and looks up their ids and the office ids.
export async function loadFixtures(api) {
  const cookies = {};
  for (const [key, email] of Object.entries(EMAILS)) cookies[key] = await api.login(email);
  const users = await query('SELECT id, email FROM users');
  const ids = {};
  for (const [key, email] of Object.entries(EMAILS)) ids[key] = users.rows.find((u) => u.email === email).id;
  const offices = await query('SELECT id, code FROM offices');
  const officeIds = {
    A: offices.rows.find((o) => o.code === 'DEMO-A').id,
    B: offices.rows.find((o) => o.code === 'DEMO-B').id,
  };
  return { cookies, ids, officeIds };
}

// Current valid QR payload for an office, fetched the way the admin UI does.
export async function activePayload(api, adminCookie, officeId) {
  const res = await api.get(`/offices/${officeId}/qr`, { cookie: adminCookie });
  return res.body.data.active?.payload;
}

// TEST-ONLY shortcut: inserts an event with an explicit timestamp straight into
// the database. The API can never do this (it has no timestamp input).
export async function insertEvent(userId, officeId, eventType, recordedAt) {
  await query(
    'INSERT INTO attendance_events (user_id, office_id, event_type, recorded_at) VALUES ($1, $2, $3, $4)',
    [userId, officeId, eventType, recordedAt],
  );
}

// Tiny but genuine-looking files (the server decides the type from the first bytes).
export const SAMPLE = {
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake png body')]),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake jpeg body')]),
  exe: Buffer.from('MZ\x90\x00 this is a Windows executable'),
  html: Buffer.from('<html><script>alert(1)</script></html>'),
};

export const isoDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
};
