import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insertEvent, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;
const as = (who) => ({ cookie: fx.cookies[who] });

const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, amount) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return dateKey(value);
};

function localIso(date, hour, timezone) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    instant += target - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour));
  }
  return new Date(instant).toISOString();
}

describe('student monthly duty summary and attendance correction', () => {
  it('aggregates term-bounded months and preserves authorized correction history and verified DTRs', async () => {
    const { rows: [clock] } = await query(`SELECT (now() AT TIME ZONE i.timezone)::date::text AS today,
      i.timezone FROM users u JOIN institutions i ON i.id=u.institution_id WHERE u.id=$1`, [fx.ids.studentA]);
    const today = clock.today;
    const [year, month] = today.split('-').map(Number);
    const previousMonthStart = dateKey(new Date(Date.UTC(year, month - 2, 1)));
    const previousMonthEnd = dateKey(new Date(Date.UTC(year, month - 1, 0)));
    const previousMonth = previousMonthStart.slice(0, 7);
    const correctionDate = addDays(previousMonthEnd, -1);

    const termResponse = await api.post('/semesters', {
      ...as('admin'),
      body: {
        academicYear: `${year - 1}-${year}`, semester: 'first', startsOn: previousMonthStart,
        endsOn: today, completionDeadline: null, timezone: clock.timezone,
      },
    });
    assert.equal(termResponse.status, 201, JSON.stringify(termResponse.body));
    const termId = termResponse.body.data.term.id;
    assert.equal((await api.put(`/semesters/${termId}/requirements/${fx.ids.studentA}`, {
      ...as('admin'), body: { officeId: fx.officeIds.A, requiredHours: 210 },
    })).status, 200);

    // A real, immutable one-hour scan session supplies the DTR that will later
    // receive the correction as an adjustment instead of being rewritten.
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_in', localIso(previousMonthEnd, 9, clock.timezone));
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_out', localIso(previousMonthEnd, 10, clock.timezone));
    const dtr = await api.post('/dtrs', { ...as('studentA'), body: { month: previousMonth } });
    assert.equal(dtr.status, 201, JSON.stringify(dtr.body));
    assert.equal((await api.post(`/dtrs/${dtr.body.data.id}/submit`, as('studentA'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtr.body.data.id}/start-review`, as('supervisorA'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtr.body.data.id}/approve`, { ...as('supervisorA'), body: {} })).status, 200);

    const { rows: [discrepancy] } = await query(
      `INSERT INTO attendance_discrepancies(institution_id,student_id,office_id,shift_date,discrepancy_type,dedupe_key,original_details,detection_reason)
       SELECT u.institution_id,$1,$2,$3,'scheduled_no_attendance',$4,$5::jsonb,'An approved duty shift had no recorded attendance.'
       FROM users u WHERE u.id=$1 RETURNING id`,
      [fx.ids.studentA, fx.officeIds.A, correctionDate, `test-no-show:${fx.ids.studentA}:${correctionDate}`,
        JSON.stringify({ scheduledStart: localIso(correctionDate, 8, clock.timezone), scheduledEnd: localIso(correctionDate, 12, clock.timezone), timezone: clock.timezone })],
    );

    const dateList = await api.get(`/attendance-discrepancies?date=${correctionDate}&limit=200`, as('studentA'));
    assert.equal(dateList.status, 200);
    assert.equal(dateList.body.data.items.length, 1);
    assert.equal(dateList.body.data.items[0].id, discrepancy.id);
    assert.equal((await api.get(`/attendance-discrepancies?date=2020-01-01`, as('studentA'))).body.data.items.length, 0);
    assert.equal((await api.get(`/attendance-discrepancies/${discrepancy.id}`, as('supervisorB'))).status, 404);

    const correction = await api.post(`/attendance-discrepancies/${discrepancy.id}/correction-request`, {
      ...as('studentA'), body: {
        explanation: 'The scanner was unavailable during my scheduled shift.',
        events: [
          { eventType: 'time_in', recordedAt: localIso(correctionDate, 8, clock.timezone) },
          { eventType: 'time_out', recordedAt: localIso(correctionDate, 10, clock.timezone) },
        ],
        replacesEventIds: [],
      },
    });
    assert.equal(correction.status, 201, JSON.stringify(correction.body));
    assert.equal(correction.body.data.status, 'explanation_submitted');
    assert.equal((await api.get(`/attendance-discrepancies?date=${correctionDate}&status=explanation_submitted`, as('supervisorA'))).body.data.items.length, 1);
    assert.equal((await api.get(`/attendance-discrepancies?date=${correctionDate}`, as('supervisorB'))).body.data.items.length, 0);
    const pendingSummary = await api.get(`/semesters/mine/${termId}/monthly-summary`, as('studentA'));
    const pendingMonth = pendingSummary.body.data.months.find((row) => row.month === previousMonth);
    assert.equal(pendingMonth.pendingCorrectionCount, 1);
    assert.equal(pendingMonth.discrepancies[0].id, discrepancy.id);
    assert.equal(pendingMonth.discrepancies[0].status, 'explanation_submitted');

    const approved = await api.post(`/attendance-discrepancies/${discrepancy.id}/approve`, {
      ...as('supervisorA'), body: { remarks: 'Confirmed against the approved schedule.' },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.data.status, 'approved_correction');
    assert.equal((await api.post(`/attendance-discrepancies/${discrepancy.id}/approve`, {
      ...as('supervisorA'), body: { remarks: 'Duplicate attempt.' },
    })).status, 409, 'a correction cannot be approved twice');
    assert.equal((await api.get(`/attendance/me?month=${previousMonth}`, as('studentA'))).body.data.totals.recordedHours, 3);

    const summary = await api.get(`/semesters/mine/${termId}/monthly-summary`, as('studentA'));
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    const previous = summary.body.data.months.find((row) => row.month === previousMonth);
    assert.equal(previous.recordedHours, 3);
    assert.equal(previous.verifiedHours, 3);
    assert.equal(previous.pendingHours, 0);
    assert.equal(previous.adjustedHours, 2);
    assert.equal(previous.dtrStatus, 'approved');
    assert.equal(previous.pendingCorrectionCount, 0);
    const current = summary.body.data.months.find((row) => row.month === today.slice(0, 7));
    assert.ok(current?.isOngoing, 'the current calendar month is marked ongoing');
    assert.equal(current.verifiedHours, null);

    const progress = (await api.get('/semesters/mine', as('studentA'))).body.data.terms.find((row) => row.id === termId);
    assert.equal(progress.verifiedHours, 3);
    assert.equal(progress.remainingHours, 207);
    const dtrRow = await query('SELECT status,verified_seconds FROM monthly_dtrs WHERE id=$1', [dtr.body.data.id]);
    assert.equal(dtrRow.rows[0].status, 'approved');
    assert.equal(Number(dtrRow.rows[0].verified_seconds), 3600, 'the finalized DTR keeps its original verified snapshot');
    assert.equal((await query('SELECT count(*)::int AS n FROM attendance_adjustments WHERE discrepancy_id=$1', [discrepancy.id])).rows[0].n, 1);
    assert.equal((await query('SELECT count(*)::int AS n FROM attendance_discrepancy_history WHERE discrepancy_id=$1', [discrepancy.id])).rows[0].n, 2);
    assert.ok((await query(`SELECT 1 FROM notifications WHERE related_type='attendance_discrepancy' AND related_id=$1 LIMIT 1`, [discrepancy.id])).rowCount > 0);

    const { rows: [otherInstitution] } = await query(`INSERT INTO institutions(name,timezone) VALUES ('Monthly Summary Isolation','UTC') RETURNING id`);
    const { rows: [otherTerm] } = await query(
      `INSERT INTO academic_terms(institution_id,academic_year,semester,starts_on,ends_on,timezone,created_by)
       VALUES($1,'2025-2026','first','2025-08-01','2025-12-31','UTC',$2) RETURNING id`,
      [otherInstitution.id, fx.ids.admin],
    );
    assert.equal((await api.get(`/semesters/mine/${otherTerm.id}/monthly-summary`, as('studentA'))).status, 403);
  });
});
