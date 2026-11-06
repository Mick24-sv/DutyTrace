import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insertEvent, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

let fx;
const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
const as = who => ({ cookie: fx.cookies[who] });
const endpoint = '/attendance-discrepancies/supervisor-correction';

describe('supervisor duty-time amendments', () => {
  it('corrects current attendance, preserves originals, supports repeat edits and enforces office access', async () => {
    // Use yesterday, including on the first day of a month.
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const iso = hour => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_in', iso(8));
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_out', iso(10));
    const history = async () => (await api.get(`/attendance/users/${fx.ids.studentA}?month=${date.slice(0, 7)}`, as('supervisorA'))).body.data;
    let data = await history();
    const session = data.days.flatMap(d => d.sessions)[0];
    const body = {
      studentId: fx.ids.studentA, sessionId: session.id, originalTimeIn: session.timeIn, originalTimeOut: session.timeOut,
      events: [{ eventType: 'time_in', recordedAt: iso(8) }, { eventType: 'time_out', recordedAt: iso(11) }],
      remarks: 'Corrected after checking the office attendance log.',
    };
    assert.equal((await api.post(endpoint, { ...as('supervisorB'), body })).status, 404);
    assert.equal((await api.post(endpoint, { ...as('studentA'), body })).status, 403);
    assert.equal((await api.post(endpoint, { ...as('admin'), body })).status, 403);
    assert.equal((await api.post(endpoint, { ...as('supervisorA'), body: { ...body, remarks: ' ' } })).status, 400);
    const saved = await api.post(endpoint, { ...as('supervisorA'), body });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.data.status, 'approved_correction');
    data = await history();
    assert.equal(data.totals.recordedHours, 3);
    assert.equal((await api.post(endpoint, { ...as('supervisorA'), body })).status, 409, 'stale edits are rejected');
    const corrected = data.days.flatMap(d => d.sessions)[0];
    const repeated = await api.post(endpoint, { ...as('supervisorA'), body: {
      ...body, sessionId: corrected.id, originalTimeIn: corrected.timeIn, originalTimeOut: corrected.timeOut,
      events: [{ eventType: 'time_in', recordedAt: iso(8) }, { eventType: 'time_out', recordedAt: iso(12) }],
    } });
    assert.equal(repeated.status, 201, JSON.stringify(repeated.body));
    assert.equal((await history()).totals.recordedHours, 4);
    const raw = await query('SELECT recorded_at FROM attendance_events WHERE user_id=$1 ORDER BY recorded_at', [fx.ids.studentA]);
    assert.deepEqual(raw.rows.map(r => r.recorded_at.toISOString()), [iso(8), iso(10)]);
    const notifications = await query("SELECT id FROM notifications WHERE recipient_id=$1 AND type='attendance_correction_approved'", [fx.ids.studentA]);
    assert.equal(notifications.rowCount, 2);
    const overlap = await api.post(endpoint, { ...as('supervisorA'), body: { studentId: fx.ids.studentA, events: body.events, remarks: body.remarks } });
    assert.equal(overlap.status, 409);
    const added = await api.post(endpoint, { ...as('supervisorA'), body: {
      studentId: fx.ids.studentA, events: [{ eventType: 'time_in', recordedAt: iso(13) }, { eventType: 'time_out', recordedAt: iso(14) }], remarks: body.remarks,
    } });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    assert.equal((await history()).totals.recordedHours, 5);
    const future = new Date(Date.now() + 86400000).toISOString();
    assert.equal((await api.post(endpoint, { ...as('supervisorA'), body: {
      studentId: fx.ids.studentA, events: [{ eventType: 'time_in', recordedAt: future }, { eventType: 'time_out', recordedAt: new Date(Date.now() + 90000000).toISOString() }], remarks: body.remarks,
    } })).status, 400);
  });

  it('completes a missing time-out and retains an approved DTR snapshot when amended twice', async () => {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    const iso = hour => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const studentId = fx.ids.studentA2;
    await insertEvent(studentId, fx.officeIds.A, 'time_in', iso(8));
    const history = async () => (await api.get(`/attendance/users/${studentId}?month=${month}`, as('supervisorA'))).body.data;
    const missing = (await history()).days.flatMap(d => d.sessions)[0];
    const amend = async (session, hour) => api.post(endpoint, { ...as('supervisorA'), body: {
      studentId, sessionId: session.id, originalTimeIn: session.timeIn, originalTimeOut: session.timeOut,
      events: [{ eventType: 'time_in', recordedAt: iso(8) }, { eventType: 'time_out', recordedAt: iso(hour) }],
      remarks: 'Verified against the office duty log.',
    } });
    assert.equal((await amend(missing, 10)).status, 201);
    const created = await api.post('/dtrs', { ...as('studentA2'), body: { month } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const dtrId = created.body.data.id;
    assert.equal((await api.post(`/dtrs/${dtrId}/submit`, as('studentA2'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtrId}/start-review`, as('supervisorA'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtrId}/approve`, { ...as('supervisorA'), body: {} })).status, 200);
    const snapshot = await query('SELECT verified_seconds,current_revision FROM monthly_dtrs WHERE id=$1', [dtrId]);
    for(const hour of [11, 12]) {
      const session = (await history()).days.flatMap(d => d.sessions)[0];
      const result = await amend(session, hour);
      assert.equal(result.status, 201, JSON.stringify(result.body));
    }
    const data = await history();
    assert.equal(data.totals.recordedHours, 4);
    assert.equal(data.totals.verifiedHours, 4);
    assert.deepEqual((await query('SELECT verified_seconds,current_revision FROM monthly_dtrs WHERE id=$1', [dtrId])).rows, snapshot.rows);
    const delta = await query('SELECT sum(verified_delta_seconds)::int AS seconds FROM attendance_adjustments WHERE student_id=$1 AND dtr_month=$2', [studentId, month]);
    assert.equal(delta.rows[0].seconds, 7200);
  });
});
