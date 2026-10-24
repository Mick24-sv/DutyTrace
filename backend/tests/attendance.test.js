import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activePayload, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';
import { buildPayload } from '../src/modules/qr/qr.service.js';

let api;
let fx;
let payloadA;
let payloadB;
const ctx = setupTestServer({}, async () => {
  fx = await loadFixtures(api);
  payloadA = await activePayload(api, fx.cookies.admin, fx.officeIds.A);
  payloadB = await activePayload(api, fx.cookies.admin, fx.officeIds.B);
});
api = makeClient(ctx);

const scan = (who, action, qrPayload, extra = {}) =>
  api.post('/attendance/scan', { cookie: fx.cookies[who], body: { action, qrPayload, ...extra } });
const eventCount = async (userId) =>
  (await query('SELECT count(*)::int AS n FROM attendance_events WHERE user_id = $1', [userId])).rows[0].n;

test('attendance status and history use the institution timezone', async () => {
  const { rows: [institution] } = await query(
    'SELECT i.id,i.timezone FROM institutions i JOIN users u ON u.institution_id=i.id WHERE u.id=$1', [fx.ids.studentA],
  );
  try {
    await query("UPDATE institutions SET timezone='Asia/Manila' WHERE id=$1", [institution.id]);
    for (const path of ['/attendance/status', '/attendance/me?month=2026-10', `/attendance/office/${fx.officeIds.A}/summary?month=2026-10`]) {
      const res = await api.get(path, { cookie: path.includes('/office/') ? fx.cookies.supervisorA : fx.cookies.studentA });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.timezone, 'Asia/Manila');
    }
  } finally {
    await query('UPDATE institutions SET timezone=$2 WHERE id=$1', [institution.id, institution.timezone]);
  }
});

describe('who may scan', () => {
  test('anonymous users are rejected (401)', async () => {
    assert.equal((await api.post('/attendance/scan', { body: { action: 'time_in', qrPayload: payloadA } })).status, 401);
    assert.equal((await api.get('/attendance/status')).status, 401);
  });

  test('administrators have no attendance of their own (403)', async () => {
    assert.equal((await scan('admin', 'time_in', payloadA)).status, 403);
    assert.equal((await api.get('/attendance/status', { cookie: fx.cookies.admin })).status, 403);
  });

  test('a user with no office assignment is refused (NOT_ASSIGNED)', async () => {
    const email = 'floating@demo.dutytrace.test';
    const created = await api.post('/users', {
      cookie: fx.cookies.admin,
      body: { email, fullName: 'Floating Student', role: 'student', password: 'a-long-password-1' },
    });
    assert.equal(created.status, 201);
    const cookie = await api.login(email, 'a-long-password-1');
    const res = await api.post('/attendance/scan', { cookie, body: { action: 'time_in', qrPayload: payloadA } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'NOT_ASSIGNED');
  });
});

describe('QR validation', () => {
  test('garbage, tampered and unknown-but-well-formed codes are all rejected as INVALID_QR', async () => {
    const [prefix, id, sig] = payloadA.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    const unknownId = buildPayload('3f2b8f0e-7a41-4c0e-9f3a-5d2e6b1a9c10'); // correctly signed, but no such code
    for (const bad of ['hello', 'https://example.com', `${prefix}.${id}.${flipped}`, unknownId, 'DT1..']) {
      const res = await scan('studentA', 'time_in', bad);
      assert.equal(res.status, 400, bad);
      assert.equal(res.body.error.code, 'INVALID_QR', bad);
    }
    assert.equal(await eventCount(fx.ids.studentA), 0, 'no event may be recorded');
  });

  test('bad request bodies fail validation (400)', async () => {
    assert.equal((await scan('studentA', 'lunch', payloadA)).status, 400);
    assert.equal((await scan('studentA', 'time_in', '')).status, 400);
    assert.equal((await api.post('/attendance/scan', { cookie: fx.cookies.studentA, body: {} })).status, 400);
  });

  test('a code from another office is refused (WRONG_OFFICE), for students and supervisors', async () => {
    const student = await scan('studentB', 'time_in', payloadA);
    assert.equal(student.status, 403);
    assert.equal(student.body.error.code, 'WRONG_OFFICE');
    const supervisor = await scan('supervisorA', 'time_in', payloadB);
    assert.equal(supervisor.status, 403);
    assert.equal(supervisor.body.error.code, 'WRONG_OFFICE');
    assert.equal(await eventCount(fx.ids.studentB), 0);
    assert.equal(await eventCount(fx.ids.supervisorA), 0);
  });
});

describe('time-in / time-out sequence', () => {
  test('time-in is recorded with the SERVER clock and the signed-in user', async () => {
    const t0 = (await query('SELECT now() AS t')).rows[0].t;
    const res = await scan('studentA', 'time_in', payloadA);
    const t1 = (await query('SELECT clock_timestamp() AS t')).rows[0].t;
    assert.equal(res.status, 201);
    assert.equal(res.body.data.state, 'timed_in');
    assert.equal(res.body.data.office.code, 'DEMO-A');
    assert.equal(res.body.data.session, null);

    const { rows } = await query('SELECT * FROM attendance_events WHERE id = $1', [res.body.data.event.id]);
    assert.equal(rows[0].user_id, fx.ids.studentA);
    assert.equal(rows[0].office_id, fx.officeIds.A);
    assert.equal(rows[0].event_type, 'time_in');
    assert.equal(rows[0].source, 'qr');
    assert.ok(rows[0].qr_code_id, 'event is traceable to the QR code scanned');
    assert.ok(rows[0].recorded_at >= t0 && rows[0].recorded_at <= t1, 'timestamp comes from the database clock');
  });

  test('status reflects the open session', async () => {
    const res = await api.get('/attendance/status', { cookie: fx.cookies.studentA });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.state, 'timed_in');
    assert.equal(res.body.data.office.code, 'DEMO-A');
  });

  test('a second time-in is refused (ALREADY_TIMED_IN) and records nothing', async () => {
    const res = await scan('studentA', 'time_in', payloadA);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ALREADY_TIMED_IN');
    assert.equal(await eventCount(fx.ids.studentA), 1);
  });

  test('time-out without a time-in is refused (NO_ACTIVE_SESSION)', async () => {
    const res = await scan('studentA2', 'time_out', payloadA);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NO_ACTIVE_SESSION');
    assert.equal(await eventCount(fx.ids.studentA2), 0);
  });

  test('time-out closes the session and reports its length; a second time-out is refused', async () => {
    const res = await scan('studentA', 'time_out', payloadA);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.state, 'timed_out');
    assert.ok(Number.isInteger(res.body.data.session.seconds) && res.body.data.session.seconds >= 0);
    assert.equal(res.body.data.session.needsReview, false);

    const again = await scan('studentA', 'time_out', payloadA);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'NO_ACTIVE_SESSION');
    assert.equal(await eventCount(fx.ids.studentA), 2);
  });

  test('the sequence can repeat: in, out, in, out are stored in order', async () => {
    for (const action of ['time_in', 'time_out', 'time_in', 'time_out']) {
      assert.equal((await scan('studentA', action, payloadA)).status, 201, action);
    }
    const { rows } = await query('SELECT event_type FROM attendance_events WHERE user_id = $1 ORDER BY recorded_at, seq', [fx.ids.studentA]);
    assert.deepEqual(rows.map((r) => r.event_type), ['time_in', 'time_out', 'time_in', 'time_out', 'time_in', 'time_out']);
  });

  test('a time-out after the length limit is flagged for review in the response', async () => {
    // Test-only backdating by SQL: the API itself cannot do this.
    await query(
      "INSERT INTO attendance_events (user_id, office_id, event_type, recorded_at) VALUES ($1, $2, 'time_in', now() - interval '13 hours')",
      [fx.ids.studentA2, fx.officeIds.A],
    );
    const res = await scan('studentA2', 'time_out', payloadA);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.session.needsReview, true);
  });
});

describe('own attendance only, server time only', () => {
  test('a supplied userId or timestamp is ignored: the event belongs to the signed-in user, stamped now', async () => {
    const res = await scan('studentB', 'time_in', payloadB, {
      userId: fx.ids.studentA, // try to clock someone else in
      recordedAt: '2020-01-01T00:00:00Z', // try to backdate
      timestamp: '2020-01-01T00:00:00Z',
    });
    assert.equal(res.status, 201);
    const { rows } = await query('SELECT user_id, recorded_at FROM attendance_events WHERE id = $1', [res.body.data.event.id]);
    assert.equal(rows[0].user_id, fx.ids.studentB, 'recorded for the signed-in user');
    assert.ok(Date.now() - rows[0].recorded_at.getTime() < 60_000, 'stamped with the current server time');
    assert.equal(await eventCount(fx.ids.studentA2), 2, 'nobody else gained an event');
    await scan('studentB', 'time_out', payloadB);
  });

  test('supervisors record their own attendance, separate from student records', async () => {
    assert.equal((await scan('supervisorA', 'time_in', payloadA)).status, 201);
    assert.equal((await scan('supervisorA', 'time_out', payloadA)).status, 201);
    const { rows } = await query('SELECT DISTINCT user_id FROM attendance_events WHERE user_id = $1', [fx.ids.supervisorA]);
    assert.equal(rows.length, 1);
    const students = await query("SELECT count(*)::int AS n FROM attendance_events e JOIN users u ON u.id = e.user_id WHERE u.role = 'supervisor' AND e.user_id <> $1", [fx.ids.supervisorA]);
    assert.equal(students.rows[0].n, 0);
  });
});

describe('integrity', () => {
  test('simultaneous time-ins from the same user: exactly one succeeds', async () => {
    // Many rounds of many parallel requests make an unlocked check-then-insert race very likely to show up.
    for (let round = 0; round < 5; round += 1) {
      const before = await eventCount(fx.ids.supervisorB);
      const results = await Promise.all(Array.from({ length: 25 }, () => scan('supervisorB', 'time_in', payloadB)));
      const created = results.filter((r) => r.status === 201).length;
      const refused = results.filter((r) => r.status === 409).length;
      assert.equal(created, 1, `round ${round}: exactly one time-in may be recorded`);
      assert.equal(refused, 24, `round ${round}: the rest must be refused`);
      assert.equal((await eventCount(fx.ids.supervisorB)) - before, 1);
      assert.equal((await scan('supervisorB', 'time_out', payloadB)).status, 201);
    }
  });

  test('attendance events cannot be edited or deleted, even directly in the database', async () => {
    await assert.rejects(query("UPDATE attendance_events SET event_type = 'time_out'"), /append-only/);
    await assert.rejects(query('DELETE FROM attendance_events'), /append-only/);
  });

  test('accepted and refused scans are written to the audit log', async () => {
    const { rows } = await query(
      "SELECT action, count(*)::int AS n FROM audit_logs WHERE action LIKE 'attendance.%' GROUP BY action",
    );
    const by = Object.fromEntries(rows.map((r) => [r.action, r.n]));
    assert.ok(by['attendance.time_in'] > 0);
    assert.ok(by['attendance.time_out'] > 0);
    assert.ok(by['attendance.scan_rejected'] > 0);
    const { rows: reasons } = await query("SELECT DISTINCT after_data->>'reason' AS reason FROM audit_logs WHERE action = 'attendance.scan_rejected'");
    const set = new Set(reasons.map((r) => r.reason));
    for (const code of ['INVALID_QR', 'WRONG_OFFICE', 'ALREADY_TIMED_IN', 'NO_ACTIVE_SESSION']) assert.ok(set.has(code), code);
  });
});
