import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/utils/password.js';
import { DEMO_PASSWORD, insertEvent, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;

const as = (who) => ({ cookie: fx.cookies[who] });
const termInput = (academicYear, semester, startsOn, endsOn) => ({
  academicYear, semester, startsOn, endsOn, completionDeadline: null, timezone: 'Asia/Manila',
});
const assign = (termId, studentId, officeId, requiredHours, cookie = fx.cookies.admin) => api.put(
  `/semesters/${termId}/requirements/${studentId}`,
  { cookie, body: { officeId, requiredHours } },
);

describe('semester requirements and approved-hour progress', () => {
  it('keeps institutional terms, individual targets, approvals, and assignment history separate', async () => {
    const firstResponse = await api.post('/semesters', {
      ...as('admin'),
      body: termInput('2024-2025', 'first', '2024-08-01', '2024-12-31'),
    });
    const secondResponse = await api.post('/semesters', {
      ...as('admin'),
      body: termInput('2024-2025', 'second', '2025-01-01', '2025-05-31'),
    });
    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);
    const firstTerm = firstResponse.body.data.term;
    const secondTerm = secondResponse.body.data.term;

    for (const [student, hours] of [['studentA', 120], ['studentA2', 240], ['studentB', 400]]) {
      const response = await assign(firstTerm.id, fx.ids[student], student === 'studentB' ? fx.officeIds.B : fx.officeIds.A, hours);
      assert.equal(response.status, 200);
    }
    assert.equal((await assign(secondTerm.id, fx.ids.studentA, fx.officeIds.A, 50)).status, 200);

    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_in', '2024-09-10T01:00:00Z');
    await insertEvent(fx.ids.studentA, fx.officeIds.A, 'time_out', '2024-09-10T03:00:00Z');
    await insertEvent(fx.ids.studentA2, fx.officeIds.A, 'time_in', '2024-09-11T01:00:00Z');
    await insertEvent(fx.ids.studentA2, fx.officeIds.A, 'time_out', '2024-09-11T04:00:00Z');

    const generated = await api.post('/dtrs', { ...as('studentA'), body: { month: '2024-09' } });
    assert.equal(generated.status, 201, JSON.stringify(generated.body));
    const dtrId = generated.body.data.id;
    assert.equal((await api.post(`/dtrs/${dtrId}/submit`, as('studentA'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtrId}/start-review`, as('supervisorA'))).status, 200);
    assert.equal((await api.post(`/dtrs/${dtrId}/approve`, { ...as('supervisorA'), body: {} })).status, 200);

    const firstReport = await api.get(`/reports/semester-hours?termId=${firstTerm.id}`, as('admin'));
    assert.equal(firstReport.status, 200);
    const byStudent = new Map(firstReport.body.data.items.map((student) => [student.id, student]));
    assert.equal(byStudent.get(fx.ids.studentA).requiredHours, 120);
    assert.equal(byStudent.get(fx.ids.studentA).recordedHours, 2);
    assert.equal(byStudent.get(fx.ids.studentA).verifiedHours, 2);
    assert.equal(byStudent.get(fx.ids.studentA2).requiredHours, 240);
    assert.equal(byStudent.get(fx.ids.studentA2).recordedHours, 3);
    assert.equal(byStudent.get(fx.ids.studentA2).verifiedHours, 0);
    assert.equal(byStudent.get(fx.ids.studentB).requiredHours, 400);

    const update = await assign(firstTerm.id, fx.ids.studentA, fx.officeIds.A, 125);
    assert.equal(update.status, 200);
    const history = await query(
      `SELECT required_hours FROM semester_requirement_assignments
       WHERE term_id = $1 AND student_id = $2 ORDER BY assigned_at, id`,
      [firstTerm.id, fx.ids.studentA],
    );
    assert.deepEqual(history.rows.map((row) => Number(row.required_hours)).sort((a, b) => a - b), [120, 125]);

    const secondReport = await api.get(`/reports/semester-hours?termId=${secondTerm.id}`, as('admin'));
    const secondStudent = secondReport.body.data.items.find((student) => student.id === fx.ids.studentA);
    assert.equal(secondStudent.requiredHours, 50);
    assert.equal(secondStudent.recordedHours, 0);
    assert.equal(secondStudent.verifiedHours, 0);
    assert.equal((await api.get('/semesters/mine', as('studentA'))).body.data.terms.length, 2);

    assert.equal((await api.post(`/semesters/${firstTerm.id}/finalize`, { ...as('admin'), body: {} })).status, 200);
    assert.equal((await assign(firstTerm.id, fx.ids.studentA, fx.officeIds.A, 150)).status, 409);

    const unassignedTerm = await api.post('/semesters', {
      ...as('admin'),
      body: termInput('2025-2026', 'summer', '2025-06-01', '2025-07-31'),
    });
    assert.equal(unassignedTerm.status, 201);
    const noAssignmentReport = await api.get(`/reports/semester-hours?termId=${unassignedTerm.body.data.term.id}`, as('admin'));
    const unassigned = noAssignmentReport.body.data.items.find((student) => student.id === fx.ids.studentA);
    assert.equal(unassigned.requirementAssigned, false);
    assert.equal(unassigned.requiredHours, null);
    assert.equal(unassigned.completionPercentage, null);
  });

  it('rejects cross-institution term and office access', async () => {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const { rows: [institution] } = await query(
      `INSERT INTO institutions (name, timezone) VALUES ('Secondary Test Institution', 'UTC') RETURNING id`,
    );
    await query(
      `INSERT INTO institution_dtr_policies (institution_id, required_monthly_hours, updated_by, updated_at)
       SELECT $1, required_monthly_hours, updated_by, updated_at FROM policy_settings`,
      [institution.id],
    );
    await query(
      `INSERT INTO users (email, password_hash, full_name, role, institution_id)
       VALUES ('secondary-admin@demo.dutytrace.test', $1, 'Secondary Admin', 'admin', $2)`,
      [passwordHash, institution.id],
    );
    const { rows: [office] } = await query(
      `INSERT INTO offices (institution_id, code, name) VALUES ($1, 'SECONDARY', 'Secondary Office') RETURNING id`,
      [institution.id],
    );
    const { rows: [student] } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, institution_id)
       VALUES ('secondary-student@demo.dutytrace.test', $1, 'Secondary Student', 'student', $2) RETURNING id`,
      [passwordHash, institution.id],
    );
    await query('INSERT INTO duty_assignments (user_id, office_id) VALUES ($1, $2)', [student.id, office.id]);
    const secondaryCookie = await api.login('secondary-admin@demo.dutytrace.test');
    const otherTerm = await api.post('/semesters', {
      cookie: secondaryCookie,
      body: termInput('2025-2026', 'first', '2025-08-01', '2025-12-31'),
    });
    assert.equal(otherTerm.status, 201);

    const primaryAdmin = await api.get(`/semesters/${otherTerm.body.data.term.id}/requirements`, as('admin'));
    assert.equal(primaryAdmin.status, 403);
    const crossStudent = await assign(otherTerm.body.data.term.id, fx.ids.studentA, fx.officeIds.A, 10, secondaryCookie);
    assert.equal(crossStudent.status, 403);
    const crossOfficeQr = await api.get(`/offices/${office.id}/qr`, as('admin'));
    assert.equal(crossOfficeQr.status, 404);
  });
});
