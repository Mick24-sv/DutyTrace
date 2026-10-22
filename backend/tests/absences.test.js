import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, loadFixtures, makeClient, query, SAMPLE, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;

const as = (who) => ({ cookie: fx.cookies[who] });
const submit = (who, body) => api.post('/absences', { ...as(who), body });
const act = (who, id, name, body) => api.post(`/absences/${id}/${name}`, { ...as(who), ...(body ? { body } : {}) });
const planned = (extra = {}) => ({ absenceType: 'planned', startDate: isoDay(3), reason: 'Family event', ...extra });
const unexpected = (extra = {}) => ({ absenceType: 'unexpected', startDate: isoDay(-2), reason: 'Sudden illness', ...extra });

describe('Phase 5 - absence notifications', () => {
  describe('submission', () => {
    it('a student submits a planned absence; the server sets the timestamp, office and status', async () => {
      const before = Date.now();
      const res = await submit('studentA', planned({ endDate: isoDay(4) }));
      assert.equal(res.status, 201);
      const d = res.body.data;
      assert.equal(d.status, 'pending');
      assert.equal(d.type, 'planned');
      assert.equal(d.startDate, isoDay(3));
      assert.equal(d.endDate, isoDay(4));
      assert.equal(d.office.id, fx.officeIds.A);
      assert.equal(d.student.id, fx.ids.studentA);
      const at = Date.parse(d.submittedAt);
      assert.ok(at >= before - 2000 && at <= Date.now() + 2000, 'submittedAt is the server clock');
      assert.equal(d.history[0].action, 'submitted');
      assert.deepEqual(d.documents, []);
    });
    it('ignores client-supplied user, office, status and timestamp', async () => {
      const res = await submit('studentA', {
        ...unexpected(), userId: fx.ids.studentB, officeId: fx.officeIds.B, status: 'reviewed',
        submittedAt: '2020-01-01T00:00:00Z', response: 'pre-approved', excused: true,
      });
      assert.equal(res.status, 201);
      const d = res.body.data;
      assert.equal(d.student.id, fx.ids.studentA);
      assert.equal(d.office.id, fx.officeIds.A);
      assert.equal(d.status, 'pending');
      assert.equal(d.response, null);
      assert.ok(Date.parse(d.submittedAt) > Date.parse('2026-01-01'));
      assert.equal('excused' in d, false);
    });
    it('end date defaults to the start date', async () => {
      const res = await submit('studentA', planned());
      assert.equal(res.body.data.endDate, res.body.data.startDate);
    });
    it('validates type, dates and reason with field-level errors', async () => {
      const cases = [
        [planned({ startDate: isoDay(-3) }), 'startDate'],
        [unexpected({ startDate: isoDay(3) }), 'startDate'],
        [planned({ endDate: isoDay(1) }), 'endDate'],
        [planned({ endDate: isoDay(40) }), 'endDate'],
        [planned({ startDate: '2026-02-31' }), 'startDate'],
        [planned({ reason: '   ' }), 'reason'],
        [planned({ reason: 'x'.repeat(2001) }), 'reason'],
        [planned({ absenceType: 'holiday' }), 'absenceType'],
        [{ absenceType: 'planned' }, 'startDate'],
      ];
      for (const [body, field] of cases) {
        const res = await submit('studentA', body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.error.details[field], `${field} in ${JSON.stringify(body)}`);
      }
    });
    it('only students can submit; anonymous callers cannot', async () => {
      for (const who of ['supervisorA', 'admin']) assert.equal((await submit(who, planned())).status, 403, who);
      assert.equal((await api.request('POST', '/absences', { body: planned() })).status, 401);
    });
    it('a student without an office cannot submit', async () => {
      await api.post('/users', { ...as('admin'), body: { email: 'noabs@demo.dutytrace.test', fullName: 'No Office', role: 'student', password: 'DemoPass!2026' } });
      const cookie = await api.login('noabs@demo.dutytrace.test');
      const res = await api.post('/absences', { cookie, body: planned() });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'NOT_ASSIGNED');
    });
  });

  describe('a notice does not excuse anything', () => {
    it('attendance totals, DTR figures and verified hours are unchanged by submitting and reviewing', async () => {
      const snapshot = async () => {
        const att = await api.get('/attendance/me', as('studentA'));
        const dtr = await api.get('/dtrs/mine', as('studentA'));
        return JSON.stringify({ totals: att.body.data.totals, days: att.body.data.days.length, verified: dtr.body.data.verifiedHoursTotal, required: dtr.body.data.policy.requiredMonthlyHours });
      };
      const before = await snapshot();
      const res = await submit('studentA', unexpected());
      await act('supervisorA', res.body.data.id, 'review', { response: 'Noted, thanks.' });
      assert.equal(await snapshot(), before);
      const tables = await query(`SELECT count(*)::int AS n FROM compliance_cases`);
      assert.equal(tables.rows[0].n, 0, 'no case is created from a notice');
    });
  });

  let noticeId;
  describe('supervisor review and status tracking', () => {
    it('the student tracks the status; the supervisor sees only their office', async () => {
      const mine = await api.get('/absences', as('studentA'));
      assert.ok(mine.body.data.absences.length >= 3);
      assert.ok(mine.body.data.absences.every((a) => a.student.id === fx.ids.studentA));
      noticeId = mine.body.data.absences.find((a) => a.status === 'pending').id;

      const sup = await api.get('/absences?status=pending', as('supervisorA'));
      assert.ok(sup.body.data.absences.length >= 3);
      assert.ok(sup.body.data.absences.every((a) => a.office.id === fx.officeIds.A && a.status === 'pending'));
      assert.equal((await api.get('/absences', as('supervisorB'))).body.data.absences.length, 0);
      assert.equal((await api.get('/absences?status=bogus', as('supervisorA'))).status, 400);
    });
    it('acknowledge (response optional) -> Acknowledged', async () => {
      const res = await act('supervisorA', noticeId, 'acknowledge');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'acknowledged');
      assert.equal(res.body.data.response, null);
    });
    it('follow-up and review require a response', async () => {
      for (const name of ['follow-up', 'review']) {
        for (const body of [undefined, {}, { response: '   ' }]) {
          const res = await act('supervisorA', noticeId, name, body);
          assert.equal(res.status, 400, `${name} ${JSON.stringify(body)}`);
          assert.ok(res.body.error.details.response);
        }
      }
    });
    it('follow-up -> Needs follow-up; the student answers; it returns to Pending', async () => {
      const f = await act('supervisorA', noticeId, 'follow-up', { response: 'Please attach the letter from your dean.' });
      assert.equal(f.body.data.status, 'needs_follow_up');
      assert.equal(f.body.data.response, 'Please attach the letter from your dean.');
      assert.ok(f.body.data.actions.includes('respond') === false, 'supervisor does not get the student action');
      const student = await api.get(`/absences/${noticeId}`, as('studentA'));
      assert.ok(student.body.data.actions.includes('respond'));
      assert.equal((await act('studentA', noticeId, 'respond', { message: '' })).status, 400);
      const r = await act('studentA', noticeId, 'respond', { message: 'Attached below.' });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.status, 'pending');
    });
    it('review -> Reviewed (final); nothing can change it afterwards', async () => {
      const r = await act('supervisorA', noticeId, 'review', { response: 'Reviewed. Thank you.' });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.status, 'reviewed');
      assert.equal(r.body.data.respondedBy, 'Demo Supervisor');
      for (const [who, name, body] of [
        ['supervisorA', 'acknowledge'], ['supervisorA', 'review', { response: 'again' }],
        ['supervisorA', 'follow-up', { response: 'again' }], ['studentA', 'respond', { message: 'hi' }],
      ]) {
        const res = await act(who, noticeId, name, body);
        assert.equal(res.status, 409, `${who} ${name}`);
        assert.equal(res.body.error.code, 'INVALID_TRANSITION');
      }
    });
    it('the history records every step with who and when, in order', async () => {
      const d = (await api.get(`/absences/${noticeId}`, as('studentA'))).body.data;
      assert.deepEqual(d.history.map((h) => h.action), ['submitted', 'acknowledged', 'follow_up_requested', 'student_responded', 'reviewed']);
      assert.deepEqual(d.history.map((h) => h.actor.role), ['student', 'supervisor', 'supervisor', 'student', 'supervisor']);
      assert.ok(d.history.every((h) => h.at));
      assert.equal(d.history[2].note, 'Please attach the letter from your dean.');
    });
    it('a notice can go straight from Pending to Reviewed', async () => {
      const n = await submit('studentA2', unexpected());
      const r = await act('supervisorA', n.body.data.id, 'review', { response: 'Fine.' });
      assert.equal(r.body.data.status, 'reviewed');
    });
  });

  describe('permissions', () => {
    let id;
    it('setup', async () => { id = (await submit('studentA', planned())).body.data.id; });
    it('other students cannot see or act on it', async () => {
      assert.equal((await api.get(`/absences/${id}`, as('studentA2'))).status, 403);
      assert.equal((await act('studentA2', id, 'respond', { message: 'x' })).status, 403);
      assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA2') })).status, 403);
      assert.ok((await api.get('/absences', as('studentA2'))).body.data.absences.every((a) => a.student.id === fx.ids.studentA2));
    });
    it('a supervisor of another office cannot see or act on it', async () => {
      assert.equal((await api.get(`/absences/${id}`, as('supervisorB'))).status, 403);
      for (const [name, body] of [['acknowledge'], ['review', { response: 'x' }], ['follow-up', { response: 'x' }]]) {
        assert.equal((await act('supervisorB', id, name, body)).status, 403, name);
      }
      assert.equal((await act('supervisorB', id, 'receipts', { method: 'email', receivedDate: isoDay(-1) })).status, 403);
    });
    it('students cannot use supervisor actions; administrators are read-only', async () => {
      for (const name of ['acknowledge', 'review', 'follow-up']) {
        assert.equal((await act('studentA', id, name, { response: 'x' })).status, 403, `student ${name}`);
        assert.equal((await act('admin', id, name, { response: 'x' })).status, 403, `admin ${name}`);
      }
      assert.equal((await api.get(`/absences/${id}`, as('admin'))).status, 200);
      assert.ok((await api.get('/absences', as('admin'))).body.data.absences.length >= 4);
    });
    it('unknown and malformed ids; anonymous access', async () => {
      assert.equal((await api.get('/absences/00000000-0000-4000-8000-000000000000', as('studentA'))).status, 403);
      assert.equal((await api.get('/absences/nope', as('studentA'))).status, 400);
      assert.equal((await api.get(`/absences/${id}`)).status, 401);
      assert.equal((await api.get('/absences')).status, 401);
    });
    it('summary counts are scoped to the viewer', async () => {
      const s = await api.get('/absences/summary', as('studentA2'));
      assert.equal(s.status, 200);
      assert.equal(s.body.data.reviewed, 1);
      const [adminSummary, adminList] = await Promise.all([
        api.get('/absences/summary', as('admin')),
        api.get('/absences', as('admin')),
      ]);
      assert.equal(adminSummary.status, 200);
      assert.equal(adminList.status, 200);
      for (const status of ['pending', 'acknowledged', 'reviewed', 'needs_follow_up']) {
        assert.equal(
          adminSummary.body.data[status === 'needs_follow_up' ? 'needsFollowUp' : status],
          adminList.body.data.absences.filter((absence) => absence.status === status).length,
          `administrator ${status} count is scoped to their institution`,
        );
      }
    });
  });

  describe('supporting documents and manual receipts', () => {
    let id;
    it('the owner uploads a PDF and an image; they are listed without any file path or URL', async () => {
      id = (await submit('studentA', planned())).body.data.id;
      const a = await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA'), filename: 'dean-letter.pdf' });
      assert.equal(a.status, 201);
      const b = await api.upload(`/absences/${id}/documents`, SAMPLE.png, { ...as('studentA'), filename: 'scan.png' });
      assert.equal(b.status, 201);
      const docs = b.body.data.documents;
      assert.deepEqual(docs.map((d) => d.fileName), ['dean-letter.pdf', 'scan.png']);
      assert.ok(docs.every((d) => d.method === 'online' && d.hasFile));
      assert.equal(JSON.stringify(b.body).includes(ctx.uploadDir), false);
      assert.deepEqual(Object.keys(docs[0]).sort(), ['fileName', 'hasFile', 'id', 'method', 'mimeType', 'notes', 'receivedBy', 'receivedDate', 'requirementId', 'sizeBytes', 'submittedAt', 'submittedBy']);
      assert.ok(b.body.data.history.some((h) => h.action === 'document_added'));
    });
    it('a supervisor records an email submission and an in-person one', async () => {
      const email = await act('supervisorA', id, 'receipts', { method: 'email', receivedDate: isoDay(-1), notes: 'Letter sent to the office inbox' });
      assert.equal(email.status, 201);
      const person = await act('supervisorA', id, 'receipts', { method: 'in_person', receivedDate: isoDay(-2), receivedById: fx.ids.supervisorA });
      const docs = person.body.data.documents;
      const manual = docs.filter((d) => d.method !== 'online');
      assert.deepEqual(manual.map((d) => d.method).sort(), ['email', 'in_person']);
      const e = docs.find((d) => d.method === 'email');
      assert.equal(e.receivedDate, isoDay(-1));
      assert.equal(e.receivedBy.fullName, 'Demo Supervisor');
      assert.equal(e.notes, 'Letter sent to the office inbox');
      assert.equal(e.hasFile, false);
    });
    it('rejects bad receipts: future date, bad method, a student as receiving staff', async () => {
      assert.equal((await act('supervisorA', id, 'receipts', { method: 'email', receivedDate: isoDay(3) })).status, 400);
      assert.equal((await act('supervisorA', id, 'receipts', { method: 'fax', receivedDate: isoDay(-1) })).status, 400);
      const bad = await act('supervisorA', id, 'receipts', { method: 'email', receivedDate: isoDay(-1), receivedById: fx.ids.studentA });
      assert.equal(bad.status, 400);
      assert.ok(bad.body.error.details.receivedById);
    });
    it('only the owner uploads; students cannot record receipts', async () => {
      assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('supervisorA') })).status, 403);
      assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('admin') })).status, 403);
      assert.equal((await act('studentA', id, 'receipts', { method: 'email', receivedDate: isoDay(-1) })).status, 403);
      assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, {})).status, 401);
    });
    it('no more uploads once the notice has been reviewed', async () => {
      await act('supervisorA', id, 'review', { response: 'ok' });
      const res = await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA') });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'NOT_ACCEPTING_DOCUMENTS');
    });
  });

  describe('database guards', () => {
    it('what was submitted cannot be edited, deleted or truncated; history is append-only', async () => {
      const { rows } = await query('SELECT id FROM absence_notices LIMIT 1');
      const id = rows[0].id;
      await assert.rejects(query(`UPDATE absence_notices SET reason = 'edited' WHERE id = $1`, [id]), /cannot be changed/);
      await assert.rejects(query(`UPDATE absence_notices SET start_date = start_date + 1 WHERE id = $1`, [id]), /cannot be changed/);
      await assert.rejects(query(`UPDATE absence_notices SET submitted_at = now() - interval '5 days' WHERE id = $1`, [id]), /cannot be changed/);
      await assert.rejects(query('DELETE FROM absence_notices WHERE id = $1', [id]), /cannot be deleted/);
      await assert.rejects(query('TRUNCATE absence_notices CASCADE'), /cannot be truncated/);
      await assert.rejects(query(`UPDATE absence_events SET note = 'x'`), /append-only/);
      await assert.rejects(query('DELETE FROM absence_events'), /append-only/);
      await assert.rejects(query(`UPDATE documents SET receipt_notes = 'x'`), /append-only/);
    });
    it('invalid status jumps are refused even with SQL', async () => {
      const { rows } = await query(`SELECT id FROM absence_notices WHERE status = 'pending' LIMIT 1`);
      await assert.rejects(query(`UPDATE absence_notices SET status = 'pending' WHERE id = $1`, [rows[0].id]), /Invalid absence status/);
      const done = await query(`SELECT id FROM absence_notices WHERE status = 'reviewed' LIMIT 1`);
      await assert.rejects(query(`UPDATE absence_notices SET status = 'pending' WHERE id = $1`, [done.rows[0].id]), /Invalid absence status/);
    });
  });

  describe('audit trail', () => {
    it('submissions, reviews, uploads and receipts are audited', async () => {
      const { rows } = await query(`SELECT action, count(*)::int AS n FROM audit_logs WHERE action LIKE 'absence.%' OR action LIKE 'document.%' GROUP BY action`);
      const got = Object.fromEntries(rows.map((r) => [r.action, r.n]));
      for (const a of ['absence.submitted', 'absence.acknowledged', 'absence.follow_up_requested', 'absence.student_responded', 'absence.reviewed', 'document.uploaded', 'document.receipt_recorded']) {
        assert.ok(got[a] >= 1, `missing ${a}`);
      }
    });
  });
});
