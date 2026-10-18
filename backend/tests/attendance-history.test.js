import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { insertEvent, loadFixtures, makeClient, setupTestServer } from './helpers/testEnv.js';

let api;
let fx;
// Fixed historical data (Asia/Manila, UTC+8). Inserted directly with explicit timestamps.
const ctx = setupTestServer({}, async () => {
  fx = await loadFixtures(api);
  const A = fx.officeIds.A;
  const s = fx.ids.studentA;
  const t = (type, iso) => insertEvent(s, A, type, iso);
  // Sep 1: two 4 h sessions = 8 h
  await t('time_in', '2026-09-01T08:00:00+08:00'); await t('time_out', '2026-09-01T12:00:00+08:00');
  await t('time_in', '2026-09-01T13:00:00+08:00'); await t('time_out', '2026-09-01T17:00:00+08:00');
  // Sep 2: 4.5 h
  await t('time_in', '2026-09-02T08:00:00+08:00'); await t('time_out', '2026-09-02T12:30:00+08:00');
  // Sep 3: forgot to time out. Sep 4: normal 2 h
  await t('time_in', '2026-09-03T08:00:00+08:00');
  await t('time_in', '2026-09-04T08:00:00+08:00'); await t('time_out', '2026-09-04T10:00:00+08:00');
  // Sep 5: time-out with no time-in
  await t('time_out', '2026-09-05T17:00:00+08:00');
  // Sep 6: 14 h session (over the 12 h limit)
  await t('time_in', '2026-09-06T08:00:00+08:00'); await t('time_out', '2026-09-06T22:00:00+08:00');
  // Sep 30 22:00 -> Oct 1 02:00: starts in September
  await t('time_in', '2026-09-30T22:00:00+08:00'); await t('time_out', '2026-10-01T02:00:00+08:00');
  // Nov 1 00:30-01:30 Manila (= Oct 31 16:30Z): belongs to NOVEMBER even though it is still Oct 31 in UTC
  await insertEvent(fx.ids.studentA2, A, 'time_in', '2026-10-31T16:30:00Z');
  await insertEvent(fx.ids.studentA2, A, 'time_out', '2026-10-31T17:30:00Z');
});
api = makeClient(ctx);

const history = (who, query = '') => api.get(`/attendance/me${query}`, { cookie: fx.cookies[who] });
const day = (data, date) => data.days.find((d) => d.date === date);

describe('monthly history and hour calculation (via the API)', () => {
  test('September totals count only complete, plausible sessions', async () => {
    const res = await history('studentA', '?month=2026-09');
    assert.equal(res.status, 200);
    const { totals } = res.body.data;
    // 8 + 4.5 + 2 + 4 (Sep 30 night session) = 18.5 h
    assert.equal(totals.recordedSeconds, 66600);
    assert.equal(totals.recordedHours, 18.5);
    assert.equal(totals.countedSessions, 5);
    // missing time-out (Sep 3) + orphan time-out (Sep 5) + 14 h session (Sep 6)
    assert.equal(totals.incompleteCount, 3);
    assert.equal(res.body.data.timezone, 'Asia/Manila');
  });

  test('days show their sessions, hours and statuses', async () => {
    const { data } = (await history('studentA', '?month=2026-09')).body;
    assert.equal(day(data, '2026-09-01').recordedHours, 8);
    assert.equal(day(data, '2026-09-01').sessions.length, 2);
    assert.equal(day(data, '2026-09-02').recordedHours, 4.5);

    const sep3 = day(data, '2026-09-03').sessions[0];
    assert.equal(sep3.status, 'missing_time_out');
    assert.equal(sep3.timeOut, null);
    assert.equal(sep3.counted, false);

    assert.equal(day(data, '2026-09-05').sessions[0].status, 'orphan_time_out');

    const sep6 = day(data, '2026-09-06');
    assert.equal(sep6.sessions[0].status, 'needs_review');
    assert.equal(sep6.sessions[0].seconds, 14 * 3600, 'raw length is shown');
    assert.equal(sep6.recordedHours, 0, 'but it is not counted');
  });

  test('a session that crosses midnight and the month end belongs to the month it started in', async () => {
    const sep = (await history('studentA', '?month=2026-09')).body.data;
    const night = day(sep, '2026-09-30').sessions[0];
    assert.equal(night.status, 'complete');
    assert.deepEqual(night.flags, ['crosses_midnight']);
    assert.equal(night.seconds, 4 * 3600);

    const oct = (await history('studentA', '?month=2026-10')).body.data;
    assert.equal(oct.totals.recordedHours, 0);
    assert.equal(oct.days.length, 0, 'no stray orphan time-out for Oct 1 02:00');
  });

  test('days are local (Manila), not UTC', async () => {
    const nov = (await history('studentA2', '?month=2026-11')).body.data;
    assert.equal(nov.totals.recordedHours, 1);
    assert.equal(nov.days[0].date, '2026-11-01');
    const oct = (await history('studentA2', '?month=2026-10')).body.data;
    assert.equal(oct.totals.recordedHours, 0);
  });

  test('recorded hours are kept separate from verified hours (nothing is verified yet)', async () => {
    const { totals } = (await history('studentA', '?month=2026-09')).body.data;
    assert.ok(totals.recordedHours > 0);
    assert.equal(totals.verifiedHours, 0);
    assert.equal(totals.verificationAvailable, false);
  });

  test('defaults to the current month and validates the month parameter', async () => {
    const res = await history('studentA');
    assert.equal(res.status, 200);
    assert.match(res.body.data.month, /^\d{4}-\d{2}$/);
    for (const bad of ['?month=2026-13', '?month=abc', '?month=2026-9', '?month=1999-01', '?month=2026-09-01']) {
      assert.equal((await history('studentA', bad)).status, 400, bad);
    }
  });

  test('a student sees only their own records', async () => {
    const other = (await history('studentA2', '?month=2026-09')).body.data;
    assert.equal(other.totals.recordedHours, 0);
    assert.equal(other.days.length, 0);
    // There is no way to name another user on /me.
    const spoof = await api.get(`/attendance/me?month=2026-09&userId=${fx.ids.studentA}`, { cookie: fx.cookies.studentA2 });
    assert.equal(spoof.body.data.totals.recordedHours, 0);
  });

  test('supervisors can read their own history; administrators cannot (no attendance of their own)', async () => {
    assert.equal((await history('supervisorA', '?month=2026-09')).status, 200);
    assert.equal((await history('admin')).status, 403);
    assert.equal((await api.get('/attendance/me')).status, 401);
  });
});

describe("reading someone else's attendance", () => {
  const read = (who, userId, q = '?month=2026-09') =>
    api.get(`/attendance/users/${userId}${q}`, { cookie: fx.cookies[who] });

  test('students can never use this endpoint, not even for themselves', async () => {
    assert.equal((await read('studentA', fx.ids.studentA)).status, 403);
    assert.equal((await read('studentA', fx.ids.studentA2)).status, 403);
  });

  test('a supervisor can read students assigned to their own office', async () => {
    const res = await read('supervisorA', fx.ids.studentA);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, 'student@demo.dutytrace.test');
    assert.equal(res.body.data.totals.recordedHours, 18.5);
    assert.equal(res.body.data.totals.verifiedHours, 0);
  });

  test('a supervisor cannot read other offices\' students, other supervisors, admins, or unknown ids', async () => {
    assert.equal((await read('supervisorA', fx.ids.studentB)).status, 403, 'student in another office');
    assert.equal((await read('supervisorA', fx.ids.supervisorB)).status, 403, 'other supervisor');
    assert.equal((await read('supervisorA', fx.ids.supervisorA)).status, 403, 'themselves (they use /me)');
    assert.equal((await read('supervisorA', fx.ids.admin)).status, 403, 'admin');
    assert.equal((await read('supervisorA', '00000000-0000-4000-8000-000000000000')).status, 403, 'unknown id looks the same');
    assert.equal((await read('supervisorB', fx.ids.studentA)).status, 403, 'the other office\'s supervisor');
  });

  test('moving a student to another office moves the supervisor\'s access with them', async () => {
    await api.request('PUT', `/users/${fx.ids.studentA2}/assignment`, { cookie: fx.cookies.admin, body: { officeId: fx.officeIds.B } });
    assert.equal((await read('supervisorA', fx.ids.studentA2)).status, 403);
    assert.equal((await read('supervisorB', fx.ids.studentA2, '?month=2026-11')).status, 200);
    await api.request('PUT', `/users/${fx.ids.studentA2}/assignment`, { cookie: fx.cookies.admin, body: { officeId: fx.officeIds.A } });
  });

  test('administrators can read any student or supervisor (read-only), but not admins', async () => {
    assert.equal((await read('admin', fx.ids.studentA)).status, 200);
    assert.equal((await read('admin', fx.ids.supervisorB)).status, 200);
    assert.equal((await read('admin', fx.ids.admin)).status, 404);
    assert.equal((await read('admin', '00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await read('admin', 'nope')).status, 400);
  });

  test('anonymous requests are rejected', async () => {
    assert.equal((await api.get(`/attendance/users/${fx.ids.studentA}`)).status, 401);
  });
});

describe('office summary for supervisors', () => {
  const summary = (who, officeId, q = '?month=2026-09') =>
    api.get(`/attendance/office/${officeId}/summary${q}`, { cookie: fx.cookies[who] });

  test('a supervisor sees every assistant in their own office with monthly totals and current state', async () => {
    const res = await summary('supervisorA', fx.officeIds.A);
    assert.equal(res.status, 200);
    const { assistants } = res.body.data;
    assert.deepEqual(assistants.map((a) => a.email).sort(), ['student2@demo.dutytrace.test', 'student@demo.dutytrace.test']);
    const a = assistants.find((x) => x.email === 'student@demo.dutytrace.test');
    assert.equal(a.totals.recordedHours, 18.5);
    assert.equal(a.totals.incompleteCount, 3);
    assert.equal(a.state, 'timed_out');
  });

  test('a supervisor cannot see another office; students cannot see any; admins can see any', async () => {
    assert.equal((await summary('supervisorA', fx.officeIds.B)).status, 403);
    assert.equal((await summary('studentA', fx.officeIds.A)).status, 403);
    assert.equal((await summary('admin', fx.officeIds.B)).status, 200);
    assert.equal((await summary('admin', '00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await api.get(`/attendance/office/${fx.officeIds.A}/summary`)).status, 401);
  });
});
