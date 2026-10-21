import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activePayload, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

let api;
let fx;
let termId;
let qr;
const ctx = setupTestServer({}, async () => {
  fx = await loadFixtures(api);
  qr = await activePayload(api, fx.cookies.admin, fx.officeIds.A);
  const term = await api.post('/semesters', { cookie: fx.cookies.admin, body: {
    academicYear: '2026-2027', semester: 'summer', startsOn: '2026-01-01', endsOn: '2026-12-31',
    completionDeadline: '2026-12-31', timezone: 'Asia/Manila',
  } });
  assert.equal(term.status, 201, JSON.stringify(term.body));
  termId = term.body.data.term.id;
});
api = makeClient(ctx);

const as = (who) => ({ cookie: fx.cookies[who] });
const days = (override = {}) => [{ weekday: 1, startsAt: '09:00', endsAt: '12:00', ...override }];
const policy = (scopeType, scopeId, opts = {}) => ({
  termId, scopeType, ...(scopeId ? { scopeId } : {}),
  effectiveStartsOn: '2026-01-01', effectiveEndsOn: '2026-12-31',
  requiredTermHours: 100, minimumDailyHours: 3,
  permittedWeekdays: [1, 2, 3, 4, 5], permittedTimeWindows: [{ startTime: '08:00', endTime: '17:00' }],
  ...(scopeType === 'student' ? { exceptionReason: 'Authorized individual accommodation' } : {}), ...opts,
});

describe('configurable duty requirements and SA schedule preferences', () => {
  it('enforces administrator permissions, configurable default, scope precedence, and overlap checks', async () => {
    assert.equal((await api.get(`/duty-schedules/admin/${termId}`, as('studentA'))).status, 403);
    const { rows: [otherInstitution] } = await query("INSERT INTO institutions (name, timezone) VALUES ('Duty Schedule Boundary Test', 'UTC') RETURNING id");
    const { rows: [otherTerm] } = await query(
      `INSERT INTO academic_terms (institution_id, academic_year, semester, starts_on, ends_on, timezone, created_by)
       VALUES ($1, '2026-2027', 'summer', '2026-01-01', '2026-12-31', 'UTC', $2) RETURNING id`,
      [otherInstitution.id, fx.ids.admin],
    );
    assert.equal((await api.get(`/duty-schedules/admin/${otherTerm.id}`, as('admin'))).status, 404);
    assert.equal((await api.put('/duty-schedules/admin/default', { ...as('studentA'), body: { minimumDailyHours: 2 } })).status, 403);
    assert.equal((await api.put('/duty-schedules/admin/default', { ...as('admin'), body: { minimumDailyHours: 2.5 } })).status, 200);
    assert.equal((await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('institution', null) })).status, 201);
    assert.equal((await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('office', fx.officeIds.A, { requiredTermHours: 150, minimumDailyHours: 4, maximumDailyHours: 8, permittedWeekdays: [1], permittedTimeWindows: [{ startTime: '08:00', endTime: '16:00' }] }) })).status, 201);
    const adminContext = await api.get(`/duty-schedules/admin/${termId}`, as('admin'));
    const officePolicy = adminContext.body.data.policies.find((item) => item.scopeType === 'office');
    const updatedPolicy = await api.put(`/duty-schedules/admin/policies/${officePolicy.id}`, { ...as('admin'), body: policy('office', fx.officeIds.A, { requiredTermHours: 155, minimumDailyHours: 4, maximumDailyHours: 8, permittedWeekdays: [1], permittedTimeWindows: [{ startTime: '08:00', endTime: '16:00' }] }) });
    assert.equal(updatedPolicy.status, 200, JSON.stringify(updatedPolicy.body));
    assert.equal(updatedPolicy.body.data.policy.requiredTermHours, 155);
    assert.equal(updatedPolicy.body.data.policy.maximumDailyHours, 8);
    const conflict = await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('office', fx.officeIds.A) });
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    const overlappingWindows = await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('student', fx.ids.studentB, { permittedTimeWindows: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '11:00', endTime: '14:00' }] }) });
    assert.equal(overlappingWindows.status, 400);
    const missingAuthorization = await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('student', fx.ids.studentA, { exceptionReason: '' }) });
    assert.equal(missingAuthorization.status, 400);
    await api.put(`/semesters/${termId}/requirements/${fx.ids.studentA}`, { ...as('admin'), body: { officeId: fx.officeIds.A, requiredHours: 120 } });
    await api.put(`/semesters/${termId}/requirements/${fx.ids.studentA2}`, { ...as('admin'), body: { officeId: fx.officeIds.A, requiredHours: 130 } });
    let mine = await api.get('/duty-schedules/mine', as('studentA'));
    assert.equal(mine.body.data.terms[0].requirement.requiredTermHours, 120, 'legacy individual hour assignment overrides non-individual policy total');
    assert.equal(mine.body.data.terms[0].requirement.minimumDailyHours, 4, 'office policy wins over institution policy');
    assert.equal(mine.body.data.terms[0].requirement.defaultMinimumDailyHours, 2.5);

    assert.equal((await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('student', fx.ids.studentA, { requiredTermHours: 90, minimumDailyHours: 2 }) })).status, 201);
    mine = await api.get('/duty-schedules/mine', as('studentA'));
    assert.equal(mine.body.data.terms[0].requirement.requiredTermHours, 90, 'explicit individual exception takes precedence over existing assigned hours');
    assert.equal(mine.body.data.terms[0].requirement.minimumDailyHours, 2);
    assert.equal((await query("SELECT count(*)::int AS n FROM audit_logs WHERE action LIKE 'duty_requirement.%'")).rows[0].n >= 4, true);
  });

  it('validates permitted days, minimum duty hours, and time windows on submission', async () => {
    const base = { termId, effectiveStartsOn: '2026-10-01', effectiveEndsOn: '2026-12-31' };
    const short = await api.post('/duty-schedules', { ...as('studentA2'), body: { ...base, days: days({ endsAt: '10:00' }) } });
    assert.equal(short.status, 201, JSON.stringify(short.body));
    let submitted = await api.post(`/duty-schedules/${short.body.data.schedule.id}/submit`, as('studentA2'));
    assert.equal(submitted.status, 400);
    assert.equal(submitted.body.error.code, 'SCHEDULE_VALIDATION_FAILED');
    assert.match(JSON.stringify(submitted.body.error.details), /at least/);

    await api.put(`/duty-schedules/${short.body.data.schedule.id}`, { ...as('studentA2'), body: { ...base, days: days({ weekday: 7 }) } });
    submitted = await api.post(`/duty-schedules/${short.body.data.schedule.id}/submit`, as('studentA2'));
    assert.equal(submitted.status, 400);
    assert.match(JSON.stringify(submitted.body.error.details), /weekday|permitted/i);

    await api.put(`/duty-schedules/${short.body.data.schedule.id}`, { ...as('studentA2'), body: { ...base, days: days({ startsAt: '20:00', endsAt: '23:00' }) } });
    submitted = await api.post(`/duty-schedules/${short.body.data.schedule.id}/submit`, as('studentA2'));
    assert.equal(submitted.status, 400);
    assert.match(JSON.stringify(submitted.body.error.details), /permitted time window/i);
    await api.put(`/duty-schedules/${short.body.data.schedule.id}`, { ...as('studentA2'), body: { ...base, days: days({ startsAt: '09:00', endsAt: '13:00' }) } });
    assert.equal((await api.post(`/duty-schedules/${short.body.data.schedule.id}/submit`, as('studentA2'))).status, 200);
    assert.equal((await api.post(`/duty-schedules/review/${short.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'reject', reason: 'Close the validation test proposal.' } })).status, 200);

  });

  it('accepts arbitrary permitted weekday combinations including Friday-only proposals', async () => {
    const configured = await api.post('/duty-schedules/admin/policies', { ...as('admin'), body: policy('office', fx.officeIds.B, { minimumDailyHours: null, maximumDailyHours: 3, permittedWeekdays: [1, 2, 3, 4, 5, 6, 7] }) });
    assert.equal(configured.status, 201, JSON.stringify(configured.body));
    const conflictingDefault = await api.put('/duty-schedules/admin/default', { ...as('admin'), body: { minimumDailyHours: 3.5 } });
    assert.equal(conflictingDefault.status, 409, JSON.stringify(conflictingDefault.body));
    const base = { termId, effectiveStartsOn: '2026-10-01', effectiveEndsOn: '2026-12-31' };
    const tooLong = await api.post('/duty-schedules', { ...as('studentB'), body: { ...base, days: days({ endsAt: '13:00' }) } });
    assert.equal(tooLong.status, 201);
    const overCap = await api.post(`/duty-schedules/${tooLong.body.data.schedule.id}/submit`, as('studentB'));
    assert.equal(overCap.status, 400);
    assert.match(JSON.stringify(overCap.body.error.details), /no more than 3/);
    await api.put(`/duty-schedules/${tooLong.body.data.schedule.id}`, { ...as('studentB'), body: { ...base, days: days() } });
    assert.equal((await api.post(`/duty-schedules/${tooLong.body.data.schedule.id}/submit`, as('studentB'))).status, 200);
    assert.equal((await api.post(`/duty-schedules/review/${tooLong.body.data.schedule.id}/decision`, { ...as('supervisorB'), body: { decision: 'approve' } })).status, 200);
    for (const weekdays of [[1, 2, 3], [4, 5, 6], [5]]) {
      const selected = weekdays.map((weekday) => ({ weekday, startsAt: '09:00', endsAt: '12:00' }));
      const created = await api.post('/duty-schedules', { ...as('studentB'), body: { ...base, days: selected } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const submitted = await api.post(`/duty-schedules/${created.body.data.schedule.id}/submit`, as('studentB'));
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      const reviewed = await api.post(`/duty-schedules/review/${created.body.data.schedule.id}/decision`, { ...as('supervisorB'), body: { decision: 'approve' } });
      assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
      assert.deepEqual(reviewed.body.data.schedule.days.map((day) => day.weekday), weekdays);
    }
  });

  it('isolates review by office, records decisions, permits revisions, and keeps QR scans independent', async () => {
    const dtrCountBefore = (await query('SELECT count(*)::int AS n FROM monthly_dtrs')).rows[0].n;
    const input = { termId, effectiveStartsOn: '2026-10-01', effectiveEndsOn: '2026-12-31', days: days() };
    const created = await api.post('/duty-schedules', { ...as('studentA'), body: input });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const scheduleId = created.body.data.schedule.id;
    assert.equal((await api.post(`/duty-schedules/${scheduleId}/submit`, as('studentA'))).status, 200);
    assert.equal((await api.get('/duty-schedules/review', as('supervisorB'))).body.data.schedules.length, 0);
    assert.equal((await api.get(`/duty-schedules/review/${scheduleId}`, as('supervisorB'))).status, 403);
    const queue = await api.get('/duty-schedules/review', as('supervisorA'));
    assert.equal(queue.body.data.schedules.some((row) => row.id === scheduleId), true);
    const reviewItem = queue.body.data.schedules.find((row) => row.id === scheduleId);
    assert.equal(reviewItem.requirement.requiredTermHours, 90);
    assert.equal(reviewItem.feasibility.feasible, false);
    assert.ok(reviewItem.feasibility.estimatedCapacityHours > 0);
    assert.ok(reviewItem.feasibility.estimatedShortfallHours > 0);
    const approved = await api.post(`/duty-schedules/review/${scheduleId}/decision`, { ...as('supervisorA'), body: { decision: 'approve' } });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.data.schedule.status, 'approved');
    const supervisorOverview = await api.get('/duty-schedules/overview', as('supervisorA'));
    assert.equal(supervisorOverview.status, 200, JSON.stringify(supervisorOverview.body));
    assert.ok(supervisorOverview.body.data.schedules.some((schedule) => schedule.id === scheduleId));
    assert.equal((await api.get('/duty-schedules/overview', as('supervisorB'))).body.data.schedules.some((schedule) => schedule.id === scheduleId), false);
    const monitored = await api.get('/duty-schedules/mine', as('studentA'));
    assert.equal(monitored.body.data.terms[0].attendanceMonitoring.measuredEvents, 0);

    const change = await api.post('/duty-schedules', { ...as('studentA'), body: input });
    assert.equal(change.body.data.schedule.requestKind, 'change');
    assert.equal((await api.post(`/duty-schedules/${change.body.data.schedule.id}/submit`, as('studentA'))).status, 200);
    const studentTwoProposal = await api.post('/duty-schedules', { ...as('studentA2'), body: { ...input, days: days({ startsAt: '10:00', endsAt: '14:00' }) } });
    assert.equal(studentTwoProposal.status, 201);
    assert.equal((await api.post(`/duty-schedules/${studentTwoProposal.body.data.schedule.id}/submit`, as('studentA2'))).status, 200);
    const conflictQueue = await api.get('/duty-schedules/review', as('supervisorA'));
    const conflictItem = conflictQueue.body.data.schedules.find((row) => row.id === studentTwoProposal.body.data.schedule.id);
    assert.ok(conflictItem.potentialConflicts.some((conflict) => conflict.studentName === 'Demo Student'));
    assert.ok(conflictItem.assignmentConflicts.some((conflict) => conflict.code === 'OFFICE_CAPACITY_EXCEEDED'));
    const blockedApproval = await api.post(`/duty-schedules/review/${studentTwoProposal.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'approve' } });
    assert.equal(blockedApproval.status, 409, JSON.stringify(blockedApproval.body));
    assert.equal(blockedApproval.body.error.code, 'SCHEDULE_CONFLICT');
    const suggestion = [{ weekday: 1, startsAt: '12:00', endsAt: '16:00' }];
    const revision = await api.post(`/duty-schedules/review/${studentTwoProposal.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'request_changes', reason: 'Try this later time.', suggestedDays: suggestion } });
    assert.equal(revision.status, 200, JSON.stringify(revision.body));
    const feedback = await api.get('/duty-schedules/mine', as('studentA2'));
    assert.deepEqual(feedback.body.data.terms[0].proposal.suggestedDays.map(({ weekday, startsAt, endsAt }) => ({ weekday, startsAt, endsAt })), suggestion);
    await api.put(`/duty-schedules/${studentTwoProposal.body.data.schedule.id}`, { ...as('studentA2'), body: { ...input, days: days({ startsAt: '12:00', endsAt: '15:00' }) } });
    assert.equal((await api.post(`/duty-schedules/${studentTwoProposal.body.data.schedule.id}/submit`, as('studentA2'))).status, 200);
    const backToBack = await api.post(`/duty-schedules/review/${studentTwoProposal.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'approve' } });
    assert.equal(backToBack.status, 200, JSON.stringify(backToBack.body));
    const requested = await api.post(`/duty-schedules/review/${change.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'request_changes', reason: 'Please adjust the Monday time.' } });
    assert.equal(requested.body.data.schedule.status, 'change_requested');
    assert.equal(requested.body.data.schedule.reviewReason, 'Please adjust the Monday time.');
    assert.equal((await api.get('/duty-schedules/review', as('supervisorA'))).body.data.schedules.length, 0);
    const resubmit = await api.put(`/duty-schedules/${change.body.data.schedule.id}`, { ...as('studentA'), body: { ...input, days: days({ startsAt: '10:00', endsAt: '13:00' }) } });
    assert.equal(resubmit.status, 200);
    assert.equal((await api.post(`/duty-schedules/${change.body.data.schedule.id}/submit`, as('studentA'))).status, 200);
    const rejected = await api.post(`/duty-schedules/review/${change.body.data.schedule.id}/decision`, { ...as('supervisorA'), body: { decision: 'reject', reason: 'This preference cannot be accommodated.' } });
    assert.equal(rejected.body.data.schedule.status, 'rejected');
    assert.equal((await query("SELECT count(*)::int AS n FROM audit_logs WHERE action LIKE 'duty_schedule.%'")).rows[0].n >= 8, true);

    const scan = await api.post('/attendance/scan', { ...as('studentA'), body: { action: 'time_in', qrPayload: qr } });
    assert.equal(scan.status, 201, JSON.stringify(scan.body));
    const clockOut = await api.post('/attendance/scan', { ...as('studentA'), body: { action: 'time_out', qrPayload: qr } });
    assert.equal(clockOut.status, 201, JSON.stringify(clockOut.body));
    assert.equal((await query('SELECT count(*)::int AS n FROM monthly_dtrs')).rows[0].n, dtrCountBefore, 'schedule preferences must not rewrite or generate monthly DTRs');
  });

  it('serializes competing approvals and rejects a student overlap after an office transfer', async () => {
    const context = await api.get(`/duty-schedules/admin/${termId}`, as('admin'));
    const officePolicy = context.body.data.policies.find((item) => item.scopeType === 'office' && item.scopeId === fx.officeIds.A);
    assert.equal((await api.put(`/duty-schedules/admin/policies/${officePolicy.id}`, {
      ...as('admin'), body: policy('office', fx.officeIds.A, { permittedWeekdays: [1, 2, 3] }),
    })).status, 200);
    const input = { termId, effectiveStartsOn: '2026-10-01', effectiveEndsOn: '2026-12-31', days: [{ weekday: 3, startsAt: '09:00', endsAt: '12:00' }] };
    const candidates = await Promise.all(['studentA', 'studentA2'].map((who) => api.post('/duty-schedules', { ...as(who), body: input })));
    for (const response of candidates) {
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal((await api.post(`/duty-schedules/${response.body.data.schedule.id}/submit`, as(response === candidates[0] ? 'studentA' : 'studentA2'))).status, 200);
    }
    const decisions = await Promise.all(candidates.map((response) => api.post(`/duty-schedules/review/${response.body.data.schedule.id}/decision`, {
      ...as('supervisorA'), body: { decision: 'approve' },
    })));
    assert.equal(decisions.filter((response) => response.status === 200).length, 1);
    assert.equal(decisions.filter((response) => response.status === 409 && response.body.error.code === 'SCHEDULE_CONFLICT').length, 1);

    const winner = decisions.findIndex((response) => response.status === 200);
    const winningStudent = winner === 0 ? fx.ids.studentA : fx.ids.studentA2;
    const winningCookie = winner === 0 ? 'studentA' : 'studentA2';
    await query('UPDATE duty_assignments SET ends_on = $2 WHERE user_id = $1 AND ends_on IS NULL', [winningStudent, '2026-10-01']);
    await query('INSERT INTO duty_assignments (user_id, office_id, starts_on) VALUES ($1, $2, $3)', [winningStudent, fx.officeIds.A, '2026-10-01']);
    const moved = await api.post('/duty-schedules', { ...as(winningCookie), body: input });
    assert.equal(moved.status, 201, JSON.stringify(moved.body));
    assert.equal((await api.post(`/duty-schedules/${moved.body.data.schedule.id}/submit`, as(winningCookie))).status, 200);
    const overlap = await api.post(`/duty-schedules/review/${moved.body.data.schedule.id}/decision`, {
      ...as('supervisorB'), body: { decision: 'approve' },
    });
    assert.equal(overlap.status, 409, JSON.stringify(overlap.body));
    assert.ok(overlap.body.error.details.conflicts.some((conflict) => conflict.code === 'STUDENT_SHIFT_OVERLAP'));
  });
});
