import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PASSWORD, insertEvent, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';
import { hashPassword } from '../src/utils/password.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;
let activeTermId;
const as = (who) => ({ cookie: fx.cookies[who] });
const monthStart = (date) => `${date.slice(0, 7)}-01`;
const monthBefore = (date, amount = 1) => {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - amount);
  return value.toISOString().slice(0, 7);
};

describe('historical duty-hour credits', () => {
  it('enforces role and office scope, aggregates verified credits, and preserves amendments', async () => {
    const { rows: [clock] } = await query(`SELECT (now() AT TIME ZONE i.timezone)::date::text AS today,i.timezone
      FROM users u JOIN institutions i ON i.id=u.institution_id WHERE u.id=$1`, [fx.ids.studentA]);
    const today = clock.today;
    const firstMonth = monthBefore(today, 3);
    const secondMonth = monthBefore(today, 2);
    const lastMonth = monthBefore(today, 1);
    const startsOn = monthStart(firstMonth);
    const createdTerm = await api.post('/semesters', { ...as('admin'), body: {
      academicYear: '2026-2027', semester: 'first', startsOn, endsOn: today,
      completionDeadline: null, timezone: clock.timezone,
    } });
    assert.equal(createdTerm.status, 201, JSON.stringify(createdTerm.body));
    const termId = createdTerm.body.data.term.id;
    activeTermId = termId;
    assert.equal((await api.put(`/semesters/${termId}/requirements/${fx.ids.studentA}`, {
      ...as('admin'), body: { officeId: fx.officeIds.A, requiredHours: 100 },
    })).status, 200);

    assert.equal((await api.get('/historical-duty-hours/options', as('studentA'))).status, 403);
    const optionsA = await api.get('/historical-duty-hours/options', as('supervisorA'));
    assert.equal(optionsA.status, 200, JSON.stringify(optionsA.body));
    assert.ok(optionsA.body.data.terms.some((term) => term.id === termId));
    assert.ok(!(await api.get('/historical-duty-hours/options', as('supervisorB'))).body.data.terms.some((term) => term.id === termId));

    const creditBody = {
      studentId: fx.ids.studentA, termId, month: firstMonth, granularity: 'monthly_total', workDate: null,
      hours: 40.5, verificationSource: 'Signed paper DTR', verificationReference: 'Paper DTR archive 2026-AUG-17',
      reason: 'Verified from the signed office attendance record.', exceptional: false,
    };
    assert.equal((await api.post('/historical-duty-hours', { ...as('admin'), body: creditBody })).status, 403);
    assert.equal((await api.post('/historical-duty-hours', { ...as('studentA'), body: creditBody })).status, 403);
    const created = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: creditBody });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.item.status, 'approved');

    const duplicate = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: creditBody });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'HISTORICAL_CREDIT_OVERLAP');
    const overlap = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: {
      ...creditBody, granularity: 'daily', workDate: `${firstMonth}-10`, hours: 4,
    } });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, 'HISTORICAL_CREDIT_OVERLAP');

    const beforeAmend = await api.get(`/semesters/mine/${termId}/monthly-summary`, as('studentA'));
    assert.equal(beforeAmend.status, 200, JSON.stringify(beforeAmend.body));
    assert.equal(beforeAmend.body.data.months.find((m) => m.month === firstMonth).historicalHours, 40.5);
    const termProgress = (await api.get('/semesters/mine', as('studentA'))).body.data.terms.find((term) => term.id === termId);
    assert.equal(termProgress.historicalHours, 40.5);
    assert.equal(termProgress.verifiedHours, 40.5);
    assert.equal(termProgress.remainingHours, 59.5);
    const forecast = await api.get(`/forecast/mine?termId=${termId}`, as('studentA'));
    assert.equal(forecast.status, 200, JSON.stringify(forecast.body));
    assert.equal(forecast.body.data.completedHours, 40.5);

    const amendment = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: {
      ...creditBody, hours: 39.25, verificationReference: 'Paper DTR archive 2026-AUG-17 amended',
      reason: 'Corrected against the signed paper DTR total.', amendsId: created.body.data.item.id,
    } });
    assert.equal(amendment.status, 201, JSON.stringify(amendment.body));
    assert.equal(amendment.body.data.item.status, 'pending_admin');
    const oversight = await api.get('/historical-duty-hours/oversight', as('admin'));
    assert.equal(oversight.status, 200);
    assert.ok(oversight.body.data.pending.some((item) => item.id === amendment.body.data.item.id));

    const note = 'Reviewed signed archive and approved the correction.';
    assert.equal((await api.post(`/historical-duty-hours/${amendment.body.data.item.id}/approve`, { ...as('admin'), body: { reason: note } })).status, 200);
    const { rows: credits } = await query(`SELECT status,hours FROM historical_duty_credits WHERE id=ANY($1::uuid[]) ORDER BY created_at`,
      [[created.body.data.item.id, amendment.body.data.item.id]]);
    assert.deepEqual(credits.map((item) => item.status), ['superseded', 'approved']);
    const afterAmend = await api.get(`/semesters/mine/${termId}/monthly-summary`, as('studentA'));
    assert.equal(afterAmend.body.data.months.find((m) => m.month === firstMonth).historicalHours, 39.25);
    assert.equal((await query('SELECT count(*)::int AS n FROM historical_duty_credit_history WHERE credit_id=ANY($1::uuid[])',
      [[created.body.data.item.id, amendment.body.data.item.id]])).rows[0].n, 4);

    const exceptional = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: {
      ...creditBody, month: lastMonth, hours: 38, exceptional: true, reason: 'Verified against the paper DTR and flagged for review.',
      verificationReference: 'Paper DTR archive 2026-SEP-05',
    } });
    assert.equal(exceptional.status, 201, JSON.stringify(exceptional.body));
    assert.equal(exceptional.body.data.item.status, 'pending_admin');
    const beforeExceptionalApproval = await api.get('/semesters/mine', as('studentA'));
    assert.equal(beforeExceptionalApproval.body.data.terms.find((term) => term.id === termId).verifiedHours, 39.25);
    assert.equal((await api.post(`/historical-duty-hours/${exceptional.body.data.item.id}/approve`, { ...as('admin'), body: { reason: note } })).status, 200);
    const afterExceptionalApproval = await api.get('/semesters/mine', as('studentA'));
    assert.equal(afterExceptionalApproval.body.data.terms.find((term) => term.id === termId).verifiedHours, 77.25);

    const dtrReport = await api.get(`/reports/dtr?month=${firstMonth}`, as('supervisorA'));
    assert.equal(dtrReport.status, 200, JSON.stringify(dtrReport.body));
    assert.equal(dtrReport.body.data.items.find((item) => item.month === firstMonth).historicalHours, 39.25);
    assert.ok((await api.get(`/reports/dtr?month=${lastMonth}`, as('supervisorA'))).body.data.items.some((item) => item.status === 'historical_credit'));
  });

  it('requires QR-free periods and prevents cross-office writes', async () => {
    const { rows: [clock] } = await query(`SELECT (now() AT TIME ZONE i.timezone)::date::text AS today,i.timezone
      FROM users u JOIN institutions i ON i.id=u.institution_id WHERE u.id=$1`, [fx.ids.studentA]);
    const month = monthBefore(clock.today, 2);
    const termId = activeTermId;
    const payload = { studentId: fx.ids.studentA, termId, month, granularity: 'daily', workDate: `${month}-10`, hours: 3,
      verificationSource: 'Paper DTR', verificationReference: 'Archive record 10-A', reason: 'Cross-check from paper DTR.' };
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_in', `${month}-10T01:00:00Z`);
    const qrConflict = await api.post('/historical-duty-hours', { ...as('supervisorA'), body: payload });
    assert.equal(qrConflict.status, 409);
    assert.equal(qrConflict.body.error.code, 'QR_ATTENDANCE_EXISTS');
    const wrongOffice = await api.post('/historical-duty-hours', { ...as('supervisorB'), body: payload });
    assert.equal(wrongOffice.status, 403);
  });

  it('isolates historical credit review by institution', async () => {
    const { rows: [clock] } = await query(`SELECT (now() AT TIME ZONE i.timezone)::date::text AS today,i.timezone
      FROM users u JOIN institutions i ON i.id=u.institution_id WHERE u.id=$1`, [fx.ids.studentA]);
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const { rows: [institution] } = await query(`INSERT INTO institutions(name,timezone) VALUES('Isolated Historical Test Institution',$1) RETURNING id`, [clock.timezone]);
    const { rows: [office] } = await query(`INSERT INTO offices(code,name,institution_id) VALUES('HIST-ISO','Historical Isolation Office',$1) RETURNING id`, [institution.id]);
    const addUser = async (email, fullName, role) => (await query(`INSERT INTO users(email,password_hash,full_name,role,status,institution_id)
      VALUES($1,$2,$3,$4,'active',$5) RETURNING id`, [email,passwordHash,fullName,role,institution.id])).rows[0].id;
    const adminId = await addUser('hist-admin@isolated.dutytrace.test','Isolated Admin','admin');
    const supervisorId = await addUser('hist-supervisor@isolated.dutytrace.test','Isolated Supervisor','supervisor');
    const studentId = await addUser('hist-student@isolated.dutytrace.test','Isolated Student','student');
    await query('INSERT INTO duty_assignments(user_id,office_id) VALUES($1,$2)', [supervisorId,office.id]);
    await query('INSERT INTO duty_assignments(user_id,office_id) VALUES($1,$2)', [studentId,office.id]);
    const month = monthBefore(clock.today,1);
    const start = monthStart(month);
    const { rows: [term] } = await query(`INSERT INTO academic_terms(institution_id,academic_year,semester,starts_on,ends_on,timezone,created_by)
      VALUES($1,'2026-2027','first',$2,$3,$4,$5) RETURNING id`, [institution.id,start,clock.today,clock.timezone,adminId]);
    await query(`INSERT INTO semester_requirement_assignments(term_id,student_id,office_id,required_hours,assigned_by)
      VALUES($1,$2,$3,100,$4)`, [term.id,studentId,office.id,adminId]);
    const supervisorCookie = await api.login('hist-supervisor@isolated.dutytrace.test');
    const foreignCredit = await api.post('/historical-duty-hours', { cookie: supervisorCookie, body: {
      studentId,termId:term.id,month,granularity:'monthly_total',hours:12,verificationSource:'Signed paper DTR',
      verificationReference:'Isolated archive record 14',reason:'Verified from the isolated office ledger.',exceptional:true,
    } });
    assert.equal(foreignCredit.status,201,JSON.stringify(foreignCredit.body));
    const mainOversight = await api.get('/historical-duty-hours/oversight',as('admin'));
    assert.ok(!mainOversight.body.data.pending.some((item)=>item.id===foreignCredit.body.data.item.id));
    const foreignAdminCookie = await api.login('hist-admin@isolated.dutytrace.test');
    const isolatedOversight = await api.get('/historical-duty-hours/oversight',{cookie:foreignAdminCookie});
    assert.ok(isolatedOversight.body.data.pending.some((item)=>item.id===foreignCredit.body.data.item.id));
    assert.equal((await api.post('/historical-duty-hours',{...as('supervisorA'),body:{
      studentId,termId:term.id,month,granularity:'monthly_total',hours:12,verificationSource:'Signed paper DTR',
      verificationReference:'Cross-tenant record 15',reason:'Attempt to cross institution boundary.',
    }})).status,403);
  });
});
