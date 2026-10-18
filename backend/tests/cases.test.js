import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isoDay, loadFixtures, makeClient, query, SAMPLE, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;

const as = (who) => ({ cookie: fx.cookies[who] });
const act = (who, id, name, body) => api.post(`/cases/${id}/${name}`, { ...as(who), ...(body ? { body } : {}) });
const detail = async (who, id) => (await api.get(`/cases/${id}`, as(who))).body.data;
const newCase = (userKey, typeId, extra = {}) => api.post('/cases', {
  ...as('admin'),
  body: { userId: fx.ids[userKey], caseTypeId: typeId, description: 'Duty hours below the configured requirement', periodStart: isoDay(-40), periodEnd: isoDay(-10), ...extra },
});

describe('Phase 5 - compliance cases', () => {
  let hoursType; let otherType;

  describe('case types (administrator configuration)', () => {
    it('lists the sample types; only administrators can manage them', async () => {
      const res = await api.get('/cases/types', as('admin'));
      assert.equal(res.status, 200);
      hoursType = res.body.data.types.find((t) => t.code === 'DEMO-HOURS');
      otherType = res.body.data.types.find((t) => t.code === 'DEMO-OTHER');
      assert.deepEqual(hoursType.requiredDocuments, ['Explanation letter']);
      for (const who of ['studentA', 'supervisorA']) {
        assert.equal((await api.get('/cases/types', as(who))).status, 403, who);
        assert.equal((await api.post('/cases/types', { ...as(who), body: { code: 'XX', name: 'x' } })).status, 403, who);
      }
      assert.equal((await api.get('/cases/types')).status, 401);
    });
    it('creates, validates and updates a type', async () => {
      const ok = await api.post('/cases/types', { ...as('admin'), body: { code: 'TEST-TYPE', name: 'Test type', requiredDocuments: ['Letter', 'Receipt'] } });
      assert.equal(ok.status, 201);
      assert.deepEqual(ok.body.data.requiredDocuments, ['Letter', 'Receipt']);
      assert.equal((await api.post('/cases/types', { ...as('admin'), body: { code: 'test-type', name: 'Dup' } })).status, 409);
      for (const body of [{ code: 'x', name: 'Short code' }, { code: 'OK-1', name: '' }, { code: 'OK-2', name: 'n', requiredDocuments: [''] }, { code: 'OK-3', name: 'n', requiredDocuments: 'letter' }]) {
        assert.equal((await api.post('/cases/types', { ...as('admin'), body })).status, 400, JSON.stringify(body));
      }
      const upd = await api.request('PATCH', `/cases/types/${ok.body.data.id}`, { ...as('admin'), body: { name: 'Renamed', requiredDocuments: ['Only one'], isActive: false } });
      assert.equal(upd.status, 200);
      assert.equal(upd.body.data.isActive, false);
      assert.equal((await api.request('PATCH', `/cases/types/${ok.body.data.id}`, { ...as('supervisorA'), body: { name: 'x' } })).status, 403);
    });
  });

  describe('opening cases', () => {
    it('only an administrator opens a case; reference, requirements and status are set by the server', async () => {
      for (const who of ['studentA', 'supervisorA']) assert.equal((await api.post('/cases', { ...as(who), body: {} })).status, 403, who);
      const res = await newCase('studentA', hoursType.id, { reference: 'CC-1999-000001', status: 'resolved' });
      assert.equal(res.status, 201);
      const c = res.body.data;
      assert.match(c.reference, /^CC-\d{4}-\d{6}$/);
      assert.notEqual(c.reference, 'CC-1999-000001');
      assert.equal(c.status, 'documents_pending');
      assert.equal(c.student.id, fx.ids.studentA);
      assert.equal(c.office.id, fx.officeIds.A);
      assert.equal(c.type.code, 'DEMO-HOURS');
      assert.equal(c.periodStart, isoDay(-40));
      assert.deepEqual(c.requirements.map((r) => [r.label, r.satisfied, r.docCount]), [['Explanation letter', false, 0]]);
      assert.equal(c.history[0].action, 'created');
      assert.equal(c.history[0].actor.role, 'admin');
    });
    it('a type with no required documents starts Open; extra requirements can be added at creation', async () => {
      const open = await newCase('studentA2', otherType.id);
      assert.equal(open.body.data.status, 'open');
      assert.deepEqual(open.body.data.requirements, []);
      const extra = await newCase('studentA2', otherType.id, { requirements: ['Medical certificate'] });
      assert.equal(extra.body.data.status, 'documents_pending');
      assert.equal(extra.body.data.requirements[0].label, 'Medical certificate');
    });
    it('validates the student, type, period and text', async () => {
      const bad = [
        [{ userId: fx.ids.supervisorA }, 'userId'], [{ userId: fx.ids.admin }, 'userId'], [{ userId: '00000000-0000-4000-8000-000000000000' }, 'userId'],
        [{ caseTypeId: '00000000-0000-4000-8000-000000000000' }, 'caseTypeId'],
        [{ periodStart: isoDay(-10), periodEnd: isoDay(-40) }, 'periodEnd'], [{ periodStart: '2026-02-31' }, 'periodStart'],
        [{ description: '   ' }, 'description'], [{ description: 'x'.repeat(4001) }, 'description'],
      ];
      for (const [extra, field] of bad) {
        const res = await newCase('studentA', hoursType.id, extra);
        assert.equal(res.status, 400, JSON.stringify(extra));
        assert.ok(res.body.error.details[field], field);
      }
      const inactive = await api.post('/cases/types', { ...as('admin'), body: { code: 'OLD-TYPE', name: 'Old' } });
      await api.request('PATCH', `/cases/types/${inactive.body.data.id}`, { ...as('admin'), body: { isActive: false } });
      assert.equal((await newCase('studentA', inactive.body.data.id)).status, 400);
    });
    it('a student with no office cannot be given a case', async () => {
      const u = await api.post('/users', { ...as('admin'), body: { email: 'nocase@demo.dutytrace.test', fullName: 'No Office', role: 'student', password: 'DemoPass!2026' } });
      const res = await api.post('/cases', { ...as('admin'), body: { userId: u.body.data.id, caseTypeId: hoursType.id, description: 'x', periodStart: isoDay(-5), periodEnd: isoDay(-1) } });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.userId);
    });
    it('reference numbers are unique even when cases are opened at the same moment', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => newCase('studentB', otherType.id)));
      assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.status)));
      const refs = results.map((r) => r.body.data.reference);
      assert.equal(new Set(refs).size, 8);
    });
    it('editing a case type later does not change cases already opened', async () => {
      await api.request('PATCH', `/cases/types/${hoursType.id}`, { ...as('admin'), body: { requiredDocuments: ['Explanation letter', 'Brand new document'] } });
      const list = await api.get('/cases?userId=' + fx.ids.studentA, as('admin'));
      const first = list.body.data.cases.find((c) => c.type.code === 'DEMO-HOURS');
      assert.equal((await detail('admin', first.id)).requirements.length, 1);
      await api.request('PATCH', `/cases/types/${hoursType.id}`, { ...as('admin'), body: { requiredDocuments: ['Explanation letter'] } });
    });
    it('nothing opens a case by itself: hours and absence notices never create one', async () => {
      const before = (await query('SELECT count(*)::int AS n FROM compliance_cases')).rows[0].n;
      await api.post('/absences', { ...as('studentA'), body: { absenceType: 'unexpected', startDate: isoDay(-2), reason: 'x' } });
      await api.get('/attendance/me', as('studentA'));
      await api.get('/dtrs/mine', as('studentA'));
      assert.equal((await query('SELECT count(*)::int AS n FROM compliance_cases')).rows[0].n, before);
    });
  });

  let caseId; let reqId;
  describe('workflow: documents -> review -> correction -> resolution -> closed', () => {
    it('setup: the student sees their case', async () => {
      const list = await api.get('/cases', as('studentA'));
      assert.ok(list.body.data.cases.every((c) => c.student.id === fx.ids.studentA));
      const c = list.body.data.cases.find((x) => x.type.code === 'DEMO-HOURS');
      caseId = c.id;
      assert.equal(c.missingRequirements, 1);
      reqId = (await detail('studentA', caseId)).requirements[0].id;
    });
    it('cannot be submitted for review while a required document is missing', async () => {
      const res = await act('studentA', caseId, 'submit');
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'DOCUMENTS_MISSING');
      assert.deepEqual(res.body.error.details.missing, ['Explanation letter']);
      assert.equal((await act('admin', caseId, 'start-review')).body.error.code, 'DOCUMENTS_MISSING');
    });
    it('the student uploads the letter and submits', async () => {
      const up = await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as('studentA'), filename: 'explanation.pdf', query: `&requirementId=${reqId}` });
      assert.equal(up.status, 201);
      assert.equal(up.body.data.requirements[0].satisfied, true);
      assert.equal(up.body.data.missingRequirements, 0);
      const res = await act('studentA', caseId, 'submit', { message: 'Here is my explanation.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'under_review');
      assert.equal(res.body.data.history.at(-1).note, 'Here is my explanation.');
    });
    it('while under review the student can no longer upload or resubmit', async () => {
      assert.equal((await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as('studentA') })).body.error.code, 'NOT_ACCEPTING_DOCUMENTS');
      assert.equal((await act('studentA', caseId, 'submit')).status, 409);
      assert.equal((await act('studentA', caseId, 'respond', { message: 'x' })).status, 409);
    });
    it('invalid moves are refused', async () => {
      assert.equal((await act('admin', caseId, 'start-review')).body.error.code, 'INVALID_TRANSITION');
      assert.equal((await act('admin', caseId, 'reopen', { reason: 'x' })).body.error.code, 'INVALID_TRANSITION');
    });
    it('requesting a correction needs a note', async () => {
      for (const body of [undefined, {}, { note: '  ' }]) {
        const res = await act('admin', caseId, 'request-correction', body);
        assert.equal(res.status, 400);
        assert.ok(res.body.error.details.note);
      }
      const res = await act('admin', caseId, 'request-correction', { note: 'The letter is unsigned. Please upload a signed copy.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'needs_correction');
      assert.equal(res.body.data.history.at(-1).note, 'The letter is unsigned. Please upload a signed copy.');
    });
    it('the student uploads a corrected document and responds (a message is required)', async () => {
      assert.equal((await api.upload(`/cases/${caseId}/documents`, SAMPLE.png, { ...as('studentA'), filename: 'signed.png', query: `&requirementId=${reqId}` })).status, 201);
      assert.equal((await act('studentA', caseId, 'respond', { message: '  ' })).status, 400);
      assert.equal((await act('studentA', caseId, 'submit')).body.error.code, 'INVALID_TRANSITION', 'a returned case is answered with respond');
      const res = await act('studentA', caseId, 'respond', { message: 'Signed copy attached.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'under_review');
      assert.equal(res.body.data.documents.length, 2);
    });
    it('resolving needs a decision; the resolution date cannot be in the future', async () => {
      for (const body of [undefined, {}, { decision: '' }]) assert.equal((await act('admin', caseId, 'resolve', body)).status, 400);
      assert.equal((await act('admin', caseId, 'resolve', { decision: 'ok', resolutionDate: isoDay(5) })).status, 400);
      assert.equal((await act('admin', caseId, 'resolve', { decision: 'ok', resolutionDate: '2026-02-31' })).status, 400);
      assert.equal((await detail('admin', caseId)).status, 'under_review');
    });
    it('resolve records the decision, the resolution date and who decided', async () => {
      const res = await act('admin', caseId, 'resolve', { decision: 'Explanation accepted. No further action.', resolutionDate: isoDay(-1) });
      assert.equal(res.status, 200);
      const c = res.body.data;
      assert.equal(c.status, 'resolved');
      assert.equal(c.decision, 'Explanation accepted. No further action.');
      assert.equal(c.resolutionDate, isoDay(-1));
      assert.equal(c.resolvedBy, 'Demo Administrator');
      assert.ok(c.resolvedAt);
      const student = await detail('studentA', caseId);
      assert.equal(student.decision, 'Explanation accepted. No further action.', 'the student sees the outcome');
      assert.equal((await act('studentA', caseId, 'submit')).status, 409);
    });
    it('a resolved case can be reopened with a reason, then resolved again; earlier decisions stay in the history', async () => {
      assert.equal((await act('admin', caseId, 'reopen', {})).status, 400);
      const re = await act('admin', caseId, 'reopen', { reason: 'New information arrived.' });
      assert.equal(re.body.data.status, 'under_review');
      assert.equal(re.body.data.decision, null, 'no decision is shown while the case is being reviewed');
      const again = await act('admin', caseId, 'resolve', { decision: 'Final decision after reopening.' });
      assert.equal(again.body.data.status, 'resolved');
      assert.equal(again.body.data.resolutionDate, (await query(`SELECT to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS d`)).rows[0].d);
      const notes = again.body.data.history.filter((h) => h.action === 'resolved').map((h) => h.note);
      assert.deepEqual(notes, ['Explanation accepted. No further action.', 'Final decision after reopening.']);
    });
    it('closing needs a note and is final', async () => {
      assert.equal((await act('admin', caseId, 'close', {})).status, 400);
      const res = await act('admin', caseId, 'close', { note: 'Filed.' });
      assert.equal(res.body.data.status, 'closed');
      assert.ok(res.body.data.closedAt);
      for (const [who, name, body] of [
        ['admin', 'reopen', { reason: 'x' }], ['admin', 'resolve', { decision: 'x' }], ['admin', 'close', { note: 'x' }],
        ['admin', 'request-correction', { note: 'x' }], ['admin', 'notes', { note: 'x' }], ['admin', 'requirements', { label: 'x' }],
        ['studentA', 'submit'], ['studentA', 'respond', { message: 'x' }],
      ]) {
        const r = await act(who, caseId, name, body);
        assert.ok([409].includes(r.status), `${who} ${name} -> ${r.status}`);
      }
      assert.equal((await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as('studentA') })).status, 409);
      assert.deepEqual((await detail('admin', caseId)).actions, []);
    });
    it('the full history is preserved: who did what, when, in order', async () => {
      const c = await detail('studentA', caseId);
      assert.deepEqual(c.history.map((h) => h.action), [
        'created', 'document_added', 'submitted_for_review', 'correction_requested', 'document_added', 'student_responded',
        'resolved', 'reopened', 'resolved', 'closed',
      ]);
      assert.ok(c.history.every((h) => h.at && h.actor.fullName));
      assert.deepEqual(
        c.history.filter((h) => h.toStatus && h.fromStatus !== h.toStatus).map((h) => h.toStatus),
        ['documents_pending', 'under_review', 'needs_correction', 'under_review', 'resolved', 'under_review', 'resolved', 'closed'],
      );
    });
  });

  describe('requirements, waivers and notes', () => {
    let id;
    it('an administrator can add a requirement; it moves an open case back to Documents pending', async () => {
      id = (await newCase('studentA2', otherType.id)).body.data.id;
      assert.equal((await detail('admin', id)).status, 'open');
      const res = await act('admin', id, 'requirements', { label: 'Signed clearance form' });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.status, 'documents_pending');
      assert.equal(res.body.data.requirements[0].label, 'Signed clearance form');
      assert.equal((await act('admin', id, 'requirements', { label: '' })).status, 400);
      assert.equal((await act('supervisorA', id, 'requirements', { label: 'x' })).status, 403);
    });
    it('a waiver needs a reason and satisfies the requirement; it cannot be waived twice', async () => {
      const r = (await detail('admin', id)).requirements[0];
      assert.equal((await act('admin', id, `requirements/${r.id}/waive`, {})).status, 400);
      const res = await act('admin', id, `requirements/${r.id}/waive`, { reason: 'Student already handed the form in person.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.requirements[0].satisfied, true);
      assert.equal(res.body.data.requirements[0].waived, true);
      assert.equal((await act('admin', id, `requirements/${r.id}/waive`, { reason: 'again' })).body.error.code, 'ALREADY_WAIVED');
      assert.equal((await act('admin', id, 'start-review')).status, 200, 'a waived requirement no longer blocks review');
    });
    it('adding a requirement during review sends the case back to Documents pending', async () => {
      const res = await act('admin', id, 'requirements', { label: 'Second letter' });
      assert.equal(res.body.data.status, 'documents_pending');
      assert.equal((await act('studentA2', id, 'submit')).body.error.code, 'DOCUMENTS_MISSING');
    });
    it('staff add notes without changing the status', async () => {
      const res = await act('admin', id, 'notes', { note: 'Called the student.' });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.status, 'documents_pending');
      assert.equal(res.body.data.history.at(-1).action, 'note_added');
      assert.equal((await act('admin', id, 'notes', { note: '  ' })).status, 400);
    });
  });

  describe('manual receipts (email / in person)', () => {
    let id; let rid;
    it('setup', async () => {
      const c = await newCase('studentA2', hoursType.id);
      id = c.body.data.id; rid = c.body.data.requirements[0].id;
    });
    it('staff record a receipt with date, receiving staff member and notes; it satisfies the requirement', async () => {
      const res = await act('supervisorA', id, 'receipts', {
        method: 'in_person', receivedDate: isoDay(-1), receivedById: fx.ids.supervisorA, notes: 'Handed over at the front desk', requirementId: rid,
      });
      assert.equal(res.status, 201);
      const d = res.body.data.documents[0];
      assert.equal(d.method, 'in_person');
      assert.equal(d.receivedDate, isoDay(-1));
      assert.equal(d.receivedBy.fullName, 'Demo Supervisor');
      assert.equal(d.notes, 'Handed over at the front desk');
      assert.equal(d.hasFile, false);
      assert.equal(res.body.data.requirements[0].satisfied, true);
      assert.equal(res.body.data.history.at(-1).action, 'receipt_recorded');
      assert.equal(res.body.data.status, 'documents_pending', 'recording a receipt does not move the case by itself');
    });
    it('the student can then submit without uploading anything', async () => {
      assert.equal((await act('studentA2', id, 'submit')).body.data.status, 'under_review');
    });
    it('an administrator can record an email receipt too', async () => {
      const res = await act('admin', id, 'receipts', { method: 'email', receivedDate: isoDay(-2) });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.documents.at(-1).receivedBy.fullName, 'Demo Administrator');
    });
    it('rejects bad receipts', async () => {
      for (const [body, field] of [
        [{ method: 'email', receivedDate: isoDay(4) }, 'receivedDate'], [{ method: 'post', receivedDate: isoDay(-1) }, 'method'],
        [{ method: 'email', receivedDate: '2026-02-31' }, 'receivedDate'], [{ method: 'email', receivedDate: isoDay(-1), receivedById: fx.ids.studentA2 }, 'receivedById'],
        [{ method: 'email', receivedDate: isoDay(-1), requirementId: '00000000-0000-4000-8000-000000000000' }, 'requirementId'],
      ]) {
        const res = await act('admin', id, 'receipts', body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.error.details[field], field);
      }
    });
    it('students cannot record receipts; a supervisor of another office cannot either', async () => {
      assert.equal((await act('studentA2', id, 'receipts', { method: 'email', receivedDate: isoDay(-1) })).status, 403);
      assert.equal((await act('supervisorB', id, 'receipts', { method: 'email', receivedDate: isoDay(-1) })).status, 403);
    });
  });

  describe('role permissions', () => {
    let id;
    it('setup', async () => { id = (await newCase('studentA', otherType.id, { requirements: ['Letter'] })).body.data.id; });

    it('other students cannot see or act on a case', async () => {
      assert.equal((await api.get(`/cases/${id}`, as('studentA2'))).status, 403);
      for (const [name, body] of [['submit'], ['respond', { message: 'x' }]]) assert.equal((await act('studentA2', id, name, body)).status, 403, name);
      const list = await api.get('/cases', as('studentA2'));
      assert.ok(list.body.data.cases.every((c) => c.student.id === fx.ids.studentA2));
      assert.equal((await api.get(`/cases?userId=${fx.ids.studentA}`, as('studentA2'))).body.data.cases.every((c) => c.student.id === fx.ids.studentA2), true);
    });
    it('a supervisor sees only their own office, read-only plus notes and receipts', async () => {
      assert.equal((await api.get(`/cases/${id}`, as('supervisorA'))).status, 200);
      assert.ok((await api.get('/cases', as('supervisorA'))).body.data.cases.every((c) => c.office.id === fx.officeIds.A));
      const d = await detail('supervisorA', id);
      assert.deepEqual(d.actions, ['add_note', 'record_receipt']);
      assert.equal((await act('supervisorA', id, 'notes', { note: 'Spoke with the student.' })).status, 201);
      for (const [name, body] of [
        ['start-review'], ['request-correction', { note: 'x' }], ['resolve', { decision: 'x' }], ['reopen', { reason: 'x' }],
        ['close', { note: 'x' }], ['requirements', { label: 'x' }], ['submit'], ['respond', { message: 'x' }],
      ]) assert.equal((await act('supervisorA', id, name, body)).status, 403, `supervisorA ${name}`);
    });
    it('a supervisor of another office has no access at all', async () => {
      assert.equal((await api.get(`/cases/${id}`, as('supervisorB'))).status, 403);
      assert.ok((await api.get('/cases', as('supervisorB'))).body.data.cases.every((c) => c.office.id === fx.officeIds.B));
      for (const [name, body] of [['notes', { note: 'x' }], ['receipts', { method: 'email', receivedDate: isoDay(-1) }], ['start-review'], ['close', { note: 'x' }]]) {
        assert.equal((await act('supervisorB', id, name, body)).status, 403, name);
      }
    });
    it('students cannot use staff actions', async () => {
      for (const [name, body] of [
        ['start-review'], ['request-correction', { note: 'x' }], ['resolve', { decision: 'x' }], ['reopen', { reason: 'x' }],
        ['close', { note: 'x' }], ['requirements', { label: 'x' }], ['notes', { note: 'x' }], ['receipts', { method: 'email', receivedDate: isoDay(-1) }],
      ]) assert.equal((await act('studentA', id, name, body)).status, 403, `student ${name}`);
      assert.equal((await api.post('/cases', { ...as('studentA'), body: {} })).status, 403);
    });
    it('administrators see everything; the filters work', async () => {
      const all = await api.get('/cases', as('admin'));
      assert.ok(all.body.data.cases.length >= 10);
      const filtered = await api.get(`/cases?status=closed&userId=${fx.ids.studentA}`, as('admin'));
      assert.ok(filtered.body.data.cases.every((c) => c.status === 'closed' && c.student.id === fx.ids.studentA));
      assert.equal((await api.get('/cases?status=bogus', as('admin'))).status, 400);
    });
    it('unknown ids, malformed ids and anonymous access', async () => {
      assert.equal((await api.get('/cases/00000000-0000-4000-8000-000000000000', as('supervisorA'))).status, 403);
      assert.equal((await api.get('/cases/nope', as('admin'))).status, 400);
      assert.equal((await api.get(`/cases/${id}`)).status, 401);
    });
    it('summary counts are scoped to the viewer', async () => {
      const s = await api.get('/cases/summary', as('studentA'));
      assert.equal(s.status, 200);
      assert.equal(s.body.data.closed, 1);
      assert.ok(s.body.data.open + s.body.data.documentsPending >= 1);
    });
  });

  describe('database guards', () => {
    it('cases cannot be deleted, truncated or have their identity changed; history is append-only', async () => {
      const { rows } = await query(`SELECT id FROM compliance_cases WHERE status <> 'closed' LIMIT 1`);
      const id = rows[0].id;
      await assert.rejects(query(`UPDATE compliance_cases SET reference = 'CC-2000-000001' WHERE id = $1`, [id]), /identity/);
      await assert.rejects(query(`UPDATE compliance_cases SET user_id = $2 WHERE id = $1`, [id, fx.ids.studentB]), /identity/);
      await assert.rejects(query(`UPDATE compliance_cases SET description = 'rewritten' WHERE id = $1`, [id]), /identity/);
      await assert.rejects(query('DELETE FROM compliance_cases WHERE id = $1', [id]), /cannot be deleted/);
      await assert.rejects(query('TRUNCATE compliance_cases CASCADE'), /cannot be truncated/);
      await assert.rejects(query(`UPDATE case_events SET note = 'x'`), /append-only/);
      await assert.rejects(query('DELETE FROM case_events'), /append-only/);
      await assert.rejects(query('TRUNCATE case_events'), /cannot be truncated/);
    });
    it('illegal status jumps, a fake resolution and changes to a closed case are refused even with SQL', async () => {
      const open = await query(`SELECT id FROM compliance_cases WHERE status = 'documents_pending' LIMIT 1`);
      await assert.rejects(query(`UPDATE compliance_cases SET status = 'resolved' WHERE id = $1`, [open.rows[0].id]), /Invalid case status/);
      await assert.rejects(query(`UPDATE compliance_cases SET status = 'open' WHERE id = $1`, [open.rows[0].id]), /Invalid case status/);
      const closed = await query(`SELECT id FROM compliance_cases WHERE status = 'closed' LIMIT 1`);
      await assert.rejects(query(`UPDATE compliance_cases SET decision = 'changed' WHERE id = $1`, [closed.rows[0].id]), /closed case cannot be changed/);
      const review = await query(`SELECT id FROM compliance_cases WHERE status = 'under_review' LIMIT 1`);
      await assert.rejects(query(`UPDATE compliance_cases SET status = 'resolved' WHERE id = $1`, [review.rows[0].id]), /resolved_has_decision|violates check/);
    });
    it('requirements can be waived once and never deleted or renamed', async () => {
      const { rows } = await query(`SELECT id FROM case_requirements WHERE waived_at IS NULL LIMIT 1`);
      await assert.rejects(query(`UPDATE case_requirements SET label = 'renamed' WHERE id = $1`, [rows[0].id]), /only be waived once/);
      await assert.rejects(query('DELETE FROM case_requirements WHERE id = $1', [rows[0].id]), /cannot be deleted/);
      await assert.rejects(query(`UPDATE case_requirements SET waived_at = now() WHERE id = $1`, [rows[0].id]), /waiver_complete|violates check/);
      const waived = await query(`SELECT id FROM case_requirements WHERE waived_at IS NOT NULL LIMIT 1`);
      await assert.rejects(query(`UPDATE case_requirements SET waived_reason = 'edited' WHERE id = $1`, [waived.rows[0].id]), /only be waived once/);
    });
    it('a correction request, closure or resolution event without a note is refused', async () => {
      const { rows } = await query(`SELECT id FROM compliance_cases LIMIT 1`);
      for (const action of ['correction_requested', 'closed', 'resolved', 'reopened']) {
        await assert.rejects(query(`INSERT INTO case_events (case_id, action, actor_id) VALUES ($1, $2, $3)`, [rows[0].id, action, fx.ids.admin]), /case_event_needs_note|violates check/, action);
      }
    });
  });

  describe('audit trail', () => {
    it('opening, uploads, receipts, status changes, corrections, decisions and closure are audited', async () => {
      const { rows } = await query(`SELECT action, count(*)::int AS n FROM audit_logs WHERE action LIKE 'case.%' OR action LIKE 'case_type.%' OR action LIKE 'document.%' GROUP BY action`);
      const got = Object.fromEntries(rows.map((r) => [r.action, r.n]));
      for (const a of [
        'case.created', 'case.submitted_for_review', 'case.review_started', 'case.correction_requested', 'case.student_responded',
        'case.resolved', 'case.reopened', 'case.closed', 'case.requirement_added', 'case.requirement_waived', 'case.note_added',
        'case_type.created', 'case_type.updated', 'document.uploaded', 'document.receipt_recorded',
      ]) assert.ok(got[a] >= 1, `missing audit action ${a}`);
    });
  });
});
