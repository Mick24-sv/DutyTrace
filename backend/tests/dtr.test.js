import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { endedMonths } from '../src/modules/dtr/dtr.rules.js';
import { EMAILS, insertEvent, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;

// Newest ended month first: M1 = last month, M2 = the month before, M3 = before that.
const [M1, M2, M3] = endedMonths(new Date(), env.timezone, 3);
const currentMonth = () => {
  const [y, m] = M1.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// 09:00 local (01:00Z) on `day`, lasting `hours`. Test-only direct insert with explicit timestamps.
async function addSession(userId, officeId, month, day, hours, { closed = true } = {}) {
  const start = new Date(`${month}-${String(day).padStart(2, '0')}T01:00:00Z`);
  await insertEvent(userId, officeId, 'time_in', start);
  if (closed) await insertEvent(userId, officeId, 'time_out', new Date(start.getTime() + hours * 3600_000));
}

const as = (who) => ({ cookie: fx.cookies[who] });
const gen = (who, month) => api.post('/dtrs', { ...as(who), body: { month } });
const act = (who, id, name, body) => api.post(`/dtrs/${id}/${name}`, { ...as(who), ...(body ? { body } : {}) });

async function setupData() {
  const { ids, officeIds } = fx;
  // studentA, M1: 4h + 3.5h + (missing time-out on day 10) + 2h  => 9.5 counted, 1 flagged
  await addSession(ids.studentA, officeIds.A, M1, 5, 4);
  await addSession(ids.studentA, officeIds.A, M1, 6, 3.5);
  await addSession(ids.studentA, officeIds.A, M1, 10, 0, { closed: false });
  await addSession(ids.studentA, officeIds.A, M1, 11, 2);
  // studentA, M2: clean month, 5h
  await addSession(ids.studentA, officeIds.A, M2, 3, 5);
  // other students in M1
  await addSession(ids.studentA2, officeIds.A, M1, 4, 6);
  await addSession(ids.studentB, officeIds.B, M1, 4, 8);
}

describe('Phase 4 - monthly DTR', () => {
  it('setup attendance', setupData);

  describe('month-end restriction', () => {
    it('refuses the current month and future months (generate and preview)', async () => {
      for (const month of [currentMonth(), '2099-01']) {
        const g = await gen('studentA', month);
        assert.equal(g.status, 409);
        assert.equal(g.body.error.code, 'MONTH_NOT_ENDED');
        const p = await api.get(`/dtrs/preview?month=${month}`, as('studentA'));
        assert.equal(p.status, 409);
      }
      const rows = await query('SELECT count(*)::int AS n FROM monthly_dtrs');
      assert.equal(rows.rows[0].n, 0, 'nothing may be stored by refused requests');
    });
    it('rejects malformed months', async () => {
      assert.equal((await gen('studentA', '2026-13')).status, 400);
      assert.equal((await gen('studentA', 'September')).status, 400);
      assert.equal((await api.get('/dtrs/preview', as('studentA'))).status, 400);
    });
    it('shows ended months with their DTR status and never includes the current month', async () => {
      const res = await api.get('/dtrs/mine', as('studentA'));
      assert.equal(res.status, 200);
      const months = res.body.data.months.map((m) => m.month);
      assert.equal(months[0], M1);
      assert.ok(!months.includes(currentMonth()));
      assert.equal(res.body.data.verifiedHoursTotal, 0);
    });
  });

  describe('preview and hour calculation', () => {
    it('preview computes from saved attendance and stores nothing', async () => {
      const res = await api.get(`/dtrs/preview?month=${M1}`, as('studentA'));
      assert.equal(res.status, 200);
      const t = res.body.data.totals;
      assert.equal(t.recordedHours, 9.5);
      assert.equal(t.requiredHours, 40);
      assert.equal(t.remainingHours, 30.5);
      assert.equal(t.incompleteCount, 1);
      assert.equal(res.body.data.flags[0].status, 'missing_time_out');
      assert.equal(res.body.data.days.length, 4);
      assert.equal(res.body.data.template.official, false);
      const rows = await query('SELECT count(*)::int AS n FROM monthly_dtrs');
      assert.equal(rows.rows[0].n, 0);
    });
    it('only students can generate or preview', async () => {
      for (const who of ['supervisorA', 'admin']) {
        assert.equal((await gen(who, M1)).status, 403);
        assert.equal((await api.get(`/dtrs/preview?month=${M1}`, as(who))).status, 403);
      }
      assert.equal((await api.request('POST', '/dtrs', { body: { month: M1 } })).status, 401);
    });
    it('a student without an office cannot generate', async () => {
      const created = await api.post('/users', {
        ...as('admin'),
        body: { email: 'nooffice@demo.dutytrace.test', fullName: 'No Office', role: 'student', password: 'DemoPass!2026' },
      });
      assert.equal(created.status, 201);
      const cookie = await api.login('nooffice@demo.dutytrace.test');
      const res = await api.post('/dtrs', { cookie, body: { month: M1 } });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'NOT_ASSIGNED');
    });
  });

  let dtrId; // studentA / M1
  describe('workflow: generate -> submit -> review -> approve', () => {
    it('generates a draft with revision 1', async () => {
      const res = await gen('studentA', M1);
      assert.equal(res.status, 201);
      const d = res.body.data;
      dtrId = d.id;
      assert.equal(d.status, 'draft');
      assert.equal(d.currentRevision, 1);
      assert.equal(d.revision.snapshot.totals.recordedHours, 9.5);
      assert.equal(d.verifiedHours, null);
      assert.equal(d.history[0].action, 'generated');
      assert.equal(d.history[0].actor.fullName.length > 0, true);
    });
    it('drafts are private: supervisor cannot see them', async () => {
      assert.equal((await api.get(`/dtrs/${dtrId}`, as('supervisorA'))).status, 403);
      const list = await api.get('/dtrs', as('supervisorA'));
      assert.equal(list.body.data.dtrs.length, 0);
      assert.equal((await act('supervisorA', dtrId, 'start-review')).status, 403);
    });
    it('verified hours stay 0 while the DTR is only a draft', async () => {
      const h = await api.get(`/attendance/me?month=${M1}`, as('studentA'));
      assert.equal(h.body.data.totals.recordedHours, 9.5);
      assert.equal(h.body.data.totals.verifiedHours, 0);
      assert.equal(h.body.data.totals.verificationAvailable, false);
    });
    it('rejects out-of-order moves', async () => {
      assert.equal((await act('studentA', dtrId, 'approve')).status, 403); // wrong role
      assert.equal((await act('supervisorA', dtrId, 'approve')).status, 403); // draft is not visible to supervisors
    });
    it('submit moves draft -> submitted and cannot be repeated', async () => {
      const res = await act('studentA', dtrId, 'submit');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'submitted');
      const again = await act('studentA', dtrId, 'submit');
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'INVALID_TRANSITION');
    });
    it('a submitted DTR is locked against regeneration', async () => {
      const res = await gen('studentA', M1);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'DTR_LOCKED');
    });
    it('supervisor cannot approve or return before starting review', async () => {
      assert.equal((await act('supervisorA', dtrId, 'approve', { acknowledgeIncomplete: true })).body.error.code, 'INVALID_TRANSITION');
      assert.equal((await act('supervisorA', dtrId, 'return', { reason: 'x' })).body.error.code, 'INVALID_TRANSITION');
    });
    it('supervisor sees it in their queue and starts review', async () => {
      const list = await api.get('/dtrs?status=submitted', as('supervisorA'));
      assert.deepEqual(list.body.data.dtrs.map((d) => d.id), [dtrId]);
      const counts = await api.get('/dtrs/review-counts', as('supervisorA'));
      assert.deepEqual(counts.body.data, { submitted: 1, underReview: 0 });
      const res = await act('supervisorA', dtrId, 'start-review');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'under_review');
    });
    it('approval of flagged attendance requires explicit acknowledgement', async () => {
      const res = await act('supervisorA', dtrId, 'approve');
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'INCOMPLETE_NOT_ACKNOWLEDGED');
      const row = await query('SELECT status, verified_seconds FROM monthly_dtrs WHERE id = $1', [dtrId]);
      assert.equal(row.rows[0].status, 'under_review');
      assert.equal(row.rows[0].verified_seconds, null);
      assert.equal((await act('supervisorA', dtrId, 'approve', { acknowledgeIncomplete: 'yes' })).status, 400);
    });
    it('approval verifies only the counted hours', async () => {
      const res = await act('supervisorA', dtrId, 'approve', { acknowledgeIncomplete: true });
      assert.equal(res.status, 200);
      const d = res.body.data;
      assert.equal(d.status, 'approved');
      assert.equal(d.verifiedHours, 9.5);
      assert.equal(d.verifiedRevision, 1);
      assert.equal(d.revision.snapshot.totals.incompleteCount, 1, 'the flagged session is still flagged, not counted');
      assert.deepEqual(d.history.map((h) => h.action), ['generated', 'submitted', 'review_started', 'approved']);
      assert.equal(d.history[3].actor.role, 'supervisor');
    });
    it('verified hours now appear in attendance totals - for that month only', async () => {
      const h = await api.get(`/attendance/me?month=${M1}`, as('studentA'));
      assert.equal(h.body.data.totals.verifiedHours, 9.5);
      assert.equal(h.body.data.totals.verificationAvailable, true);
      assert.equal(h.body.data.totals.recordedHours, 9.5);
      const other = await api.get(`/attendance/me?month=${M2}`, as('studentA'));
      assert.equal(other.body.data.totals.verifiedHours, 0);
      const office = await api.get(`/attendance/office/${fx.officeIds.A}/summary?month=${M1}`, as('supervisorA'));
      const a = office.body.data.assistants.find((x) => x.id === fx.ids.studentA);
      const a2 = office.body.data.assistants.find((x) => x.id === fx.ids.studentA2);
      assert.equal(a.totals.verifiedHours, 9.5);
      assert.equal(a2.totals.verifiedHours, 0);
      const mine = await api.get('/dtrs/mine', as('studentA'));
      assert.equal(mine.body.data.verifiedHoursTotal, 9.5);
    });
    it('an approved DTR can never be changed again', async () => {
      for (const [who, name, body] of [
        ['studentA', 'submit'], ['supervisorA', 'start-review'], ['supervisorA', 'approve', { acknowledgeIncomplete: true }],
        ['supervisorA', 'return', { reason: 'changed my mind' }],
      ]) {
        const res = await act(who, dtrId, name, body);
        assert.equal(res.status, 409, `${name} after approval`);
      }
      const regen = await gen('studentA', M1);
      assert.equal(regen.status, 409);
      assert.equal(regen.body.error.code, 'DTR_LOCKED');
      const d = await api.get(`/dtrs/${dtrId}`, as('studentA'));
      assert.equal(d.body.data.status, 'approved');
      assert.equal(d.body.data.revisions.length, 1);
    });
  });

  let returnedId; // studentA / M2
  describe('workflow: return for correction and revisions', () => {
    it('return requires a non-blank reason', async () => {
      const g = await gen('studentA', M2);
      returnedId = g.body.data.id;
      await act('studentA', returnedId, 'submit');
      await act('supervisorA', returnedId, 'start-review');
      for (const body of [undefined, {}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(1001) }]) {
        const res = await act('supervisorA', returnedId, 'return', body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.error.details.reason);
      }
      assert.equal((await api.get(`/dtrs/${returnedId}`, as('studentA'))).body.data.status, 'under_review');
    });
    it('returning records the reason, who and when; nothing is verified', async () => {
      const res = await act('supervisorA', returnedId, 'return', { reason: 'Missing the Sept 12 session' });
      assert.equal(res.status, 200);
      const d = res.body.data;
      assert.equal(d.status, 'needs_correction');
      assert.equal(d.latestReturnReason, 'Missing the Sept 12 session');
      assert.equal(d.verifiedHours, null);
      const ev = d.history.at(-1);
      assert.equal(ev.action, 'returned');
      assert.equal(ev.reason, 'Missing the Sept 12 session');
      assert.equal(ev.actor.role, 'supervisor');
      assert.ok(ev.at);
      const h = await api.get(`/attendance/me?month=${M2}`, as('studentA'));
      assert.equal(h.body.data.totals.verifiedHours, 0);
    });
    it('regenerating keeps the earlier revision and adds a new one (config change does not rewrite history)', async () => {
      await addSession(fx.ids.studentA, fx.officeIds.A, M2, 12, 2); // the correction: a session that was missing
      await api.request('PUT', '/dtrs/policy', { ...as('admin'), body: { requiredMonthlyHours: 50 } });
      const res = await gen('studentA', M2);
      assert.equal(res.status, 201);
      const d = res.body.data;
      assert.equal(d.status, 'draft');
      assert.equal(d.currentRevision, 2);
      assert.equal(d.revision.snapshot.totals.recordedHours, 7);
      assert.equal(d.revision.snapshot.totals.requiredHours, 50);
      assert.deepEqual(d.revisions.map((r) => [r.number, r.recordedHours]), [[1, 5], [2, 7]]);
      const old = await api.get(`/dtrs/${returnedId}?revision=1`, as('studentA'));
      assert.equal(old.body.data.revision.snapshot.totals.recordedHours, 5);
      assert.equal(old.body.data.revision.snapshot.totals.requiredHours, 40, 'revision 1 keeps the policy value it was made under');
      assert.equal((await api.get(`/dtrs/${returnedId}?revision=9`, as('studentA'))).status, 404);
      assert.deepEqual(d.history.map((h) => h.action), ['generated', 'submitted', 'review_started', 'returned', 'regenerated']);
    });
    it('resubmit, review and approve the corrected revision', async () => {
      assert.equal((await act('studentA', returnedId, 'submit')).body.data.status, 'submitted');
      assert.equal((await act('supervisorA', returnedId, 'start-review')).body.data.status, 'under_review');
      const res = await act('supervisorA', returnedId, 'approve'); // no flagged sessions: no acknowledgement needed
      assert.equal(res.status, 200);
      assert.equal(res.body.data.verifiedHours, 7);
      assert.equal(res.body.data.verifiedRevision, 2);
      const mine = await api.get('/dtrs/mine', as('studentA'));
      assert.equal(mine.body.data.verifiedHoursTotal, 16.5);
    });
    it('a returned DTR can be resubmitted without regenerating', async () => {
      const g = await gen('studentA', M3); // M3 has no events; a zero-hour DTR can still be generated
      assert.equal(g.status, 201);
      const id = g.body.data.id;
      assert.equal(g.body.data.revision.snapshot.totals.recordedHours, 0);
      await act('studentA', id, 'submit');
      await act('supervisorA', id, 'start-review');
      await act('supervisorA', id, 'return', { reason: 'Please confirm you had no duty this month' });
      const res = await act('studentA', id, 'submit');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'submitted');
      assert.equal(res.body.data.currentRevision, 1);
    });
  });

  describe('access control', () => {
    it('students see only their own DTRs', async () => {
      const mine = await api.get('/dtrs', as('studentA'));
      assert.ok(mine.body.data.dtrs.every((d) => d.student.id === fx.ids.studentA));
      const other = await gen('studentA2', M1);
      assert.equal(other.status, 201);
      const otherId = other.body.data.id;
      assert.equal((await api.get(`/dtrs/${otherId}`, as('studentA'))).status, 403);
      assert.equal((await api.get(`/dtrs/${otherId}/pdf`, as('studentA'))).status, 403);
      assert.equal((await act('studentA', otherId, 'submit')).status, 403);
      assert.equal((await api.get(`/dtrs/${dtrId}`, as('studentA2'))).status, 403);
      const list2 = await api.get('/dtrs', as('studentA2'));
      assert.deepEqual(list2.body.data.dtrs.map((d) => d.id), [otherId]);
    });
    it('unknown ids look the same as forbidden ones; bad ids are 400', async () => {
      assert.equal((await api.get('/dtrs/00000000-0000-4000-8000-000000000000', as('studentA'))).status, 403);
      assert.equal((await api.get('/dtrs/not-an-id', as('studentA'))).status, 400);
      assert.equal((await api.get(`/dtrs/${dtrId}`)).status, 401);
    });
    it('supervisors only see and act on DTRs of their own office', async () => {
      const b = await gen('studentB', M1);
      const bId = b.body.data.id;
      await act('studentB', bId, 'submit');
      const a2 = await api.get('/dtrs', as('studentA2')); // studentA2's draft
      await act('studentA2', a2.body.data.dtrs[0].id, 'submit');

      const listA = await api.get('/dtrs?status=submitted', as('supervisorA'));
      assert.ok(listA.body.data.dtrs.length >= 1);
      assert.ok(listA.body.data.dtrs.every((d) => d.office.id === fx.officeIds.A));
      const listB = await api.get('/dtrs', as('supervisorB'));
      assert.deepEqual(listB.body.data.dtrs.map((d) => d.id), [bId]);

      for (const [name, body] of [['start-review'], ['approve', { acknowledgeIncomplete: true }], ['return', { reason: 'no' }]]) {
        const res = await act('supervisorA', bId, name, body);
        assert.equal(res.status, 403, `supervisorA ${name} on office B`);
      }
      assert.equal((await api.get(`/dtrs/${bId}`, as('supervisorA'))).status, 403);
      assert.equal((await api.get(`/dtrs/${bId}/pdf`, as('supervisorA'))).status, 403);
      assert.equal((await api.get(`/dtrs/${dtrId}`, as('supervisorB'))).status, 403);
      assert.equal((await act('supervisorB', dtrId, 'return', { reason: 'no' })).status, 403);
      assert.equal((await api.get(`/dtrs/${bId}`, as('supervisorB'))).body.data.status, 'submitted');
    });
    it('admins can read everything but cannot approve or return', async () => {
      const all = await api.get('/dtrs', as('admin'));
      assert.ok(all.body.data.dtrs.length >= 4);
      assert.equal((await api.get(`/dtrs/${dtrId}`, as('admin'))).status, 200);
      for (const name of ['start-review', 'approve', 'return', 'submit']) {
        assert.equal((await act('admin', dtrId, name, { reason: 'x', acknowledgeIncomplete: true })).status, 403, name);
      }
    });
    it('students cannot use supervisor actions', async () => {
      for (const name of ['start-review', 'approve', 'return']) {
        assert.equal((await act('studentA', returnedId, name, { reason: 'x' })).status, 403, name);
      }
      assert.equal((await api.get('/dtrs/review-counts', as('studentA'))).status, 403);
    });
    it('policy: anyone reads it, only admins change it, with validation', async () => {
      assert.equal((await api.get('/dtrs/policy', as('studentA'))).status, 200);
      assert.equal((await api.request('PUT', '/dtrs/policy', { ...as('supervisorA'), body: { requiredMonthlyHours: 10 } })).status, 403);
      assert.equal((await api.request('PUT', '/dtrs/policy', { ...as('studentA'), body: { requiredMonthlyHours: 10 } })).status, 403);
      for (const v of [0, -5, 'ten', 5000, null]) {
        const res = await api.request('PUT', '/dtrs/policy', { ...as('admin'), body: { requiredMonthlyHours: v } });
        assert.equal(res.status, 400, String(v));
      }
      const ok = await api.request('PUT', '/dtrs/policy', { ...as('admin'), body: { requiredMonthlyHours: 40 } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.data.requiredMonthlyHours, 40);
      assert.equal(ok.body.data.requiredHoursConfirmed, false);
    });
  });

  describe('no self-approval', () => {
    it('a supervisor cannot review a DTR that is their own', async () => {
      const { ids, officeIds } = fx;
      const ins = await query(
        `INSERT INTO monthly_dtrs (user_id, office_id, month, status) VALUES ($1, $2, $3, 'submitted') RETURNING id`,
        [ids.supervisorA, officeIds.A, M1],
      );
      const id = ins.rows[0].id;
      await query(
        `INSERT INTO dtr_revisions (dtr_id, revision_no, snapshot, generated_by)
         VALUES ($1, 1, '{"totals":{"recordedSeconds":3600,"recordedHours":1,"incompleteCount":0,"requiredHours":40}}', $2)`,
        [id, ids.supervisorA],
      );
      for (const [name, body] of [['start-review'], ['approve', { acknowledgeIncomplete: true }], ['return', { reason: 'self' }]]) {
        const res = await act('supervisorA', id, name, body);
        assert.equal(res.status, 403, name);
      }
      const row = await query('SELECT status FROM monthly_dtrs WHERE id = $1', [id]);
      assert.equal(row.rows[0].status, 'submitted');
    });
    it('the database also refuses a DTR decided by its own owner', async () => {
      await assert.rejects(
        query(`UPDATE monthly_dtrs SET decided_by = user_id WHERE id = $1`, [returnedId]),
      );
    });
  });

  describe('database guards (defence in depth)', () => {
    it('revisions and history are append-only', async () => {
      await assert.rejects(query(`UPDATE dtr_revisions SET snapshot = '{}'::jsonb WHERE dtr_id = $1`, [dtrId]), /append-only/);
      await assert.rejects(query('DELETE FROM dtr_revisions WHERE dtr_id = $1', [dtrId]), /append-only/);
      await assert.rejects(query(`UPDATE dtr_events SET reason = 'edited' WHERE dtr_id = $1`, [dtrId]), /append-only/);
      await assert.rejects(query('DELETE FROM dtr_events WHERE dtr_id = $1', [dtrId]), /append-only/);
    });
    it('history and DTR tables cannot be truncated', async () => {
      for (const t of ['dtr_revisions', 'dtr_events', 'monthly_dtrs']) {
        await assert.rejects(query(`TRUNCATE ${t} CASCADE`), /cannot be truncated/, t);
      }
      const n = await query('SELECT count(*)::int AS n FROM dtr_revisions');
      assert.ok(n.rows[0].n > 0);
    });
    it('an approved DTR cannot be updated or deleted, even with SQL', async () => {
      await assert.rejects(query(`UPDATE monthly_dtrs SET verified_seconds = 999999 WHERE id = $1`, [dtrId]), /approved DTR cannot be changed/);
      await assert.rejects(query(`UPDATE monthly_dtrs SET status = 'draft' WHERE id = $1`, [dtrId]), /approved DTR cannot be changed/);
      await assert.rejects(query('DELETE FROM monthly_dtrs WHERE id = $1', [dtrId]), /cannot be deleted/);
    });
    it('illegal status jumps and fake verification are refused', async () => {
      const g = await gen('studentA2', M2);
      const id = g.body.data.id;
      await assert.rejects(query(`UPDATE monthly_dtrs SET status = 'approved' WHERE id = $1`, [id]));
      await assert.rejects(query(`UPDATE monthly_dtrs SET status = 'under_review' WHERE id = $1`, [id]), /Invalid DTR status change/);
      await assert.rejects(query(`UPDATE monthly_dtrs SET verified_seconds = 3600 WHERE id = $1`, [id]));
      await assert.rejects(query(`UPDATE monthly_dtrs SET month = '2020-01' WHERE id = $1`, [id]), /owner or month/);
    });
    it('a returned event must carry a reason', async () => {
      await assert.rejects(
        query(`INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id)
               VALUES ($1, 1, 'returned', 'under_review', 'needs_correction', $2)`, [dtrId, fx.ids.supervisorA]),
      );
    });
  });

  describe('PDF download', () => {
    it('owner downloads a PDF with the right headers', async () => {
      const res = await fetch(`${ctx.base}/api/dtrs/${dtrId}/pdf`, { headers: { cookie: fx.cookies.studentA } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition'), /^attachment; filename="DTR-\d{4}-\d{2}-[A-Za-z-]+-rev1\.pdf"$/);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
      assert.equal(Number(res.headers.get('content-length')), buf.length);
      assert.match(buf.toString('latin1'), /provisional/i, 'document title says provisional');
    });
    it('office supervisor and admin may download; others may not', async () => {
      for (const [who, status] of [['supervisorA', 200], ['admin', 200], ['supervisorB', 403], ['studentA2', 403]]) {
        const res = await fetch(`${ctx.base}/api/dtrs/${dtrId}/pdf`, { headers: { cookie: fx.cookies[who] } });
        assert.equal(res.status, status, who);
        if (status === 403) assert.equal(res.headers.get('content-type').includes('pdf'), false);
      }
      assert.equal((await fetch(`${ctx.base}/api/dtrs/${dtrId}/pdf`)).status, 401);
    });
    it('can render an older revision', async () => {
      const res = await fetch(`${ctx.base}/api/dtrs/${returnedId}/pdf?revision=1`, { headers: { cookie: fx.cookies.studentA } });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /rev1\.pdf/);
      assert.equal((await fetch(`${ctx.base}/api/dtrs/${returnedId}/pdf?revision=7`, { headers: { cookie: fx.cookies.studentA } })).status, 404);
    });
  });

  describe('audit trail and concurrency', () => {
    it('every workflow step is in the append-only audit log', async () => {
      const { rows } = await query(
        `SELECT action, count(*)::int AS n FROM audit_logs WHERE action LIKE 'dtr.%' OR action LIKE 'policy.%' GROUP BY action`,
      );
      const got = Object.fromEntries(rows.map((r) => [r.action, r.n]));
      for (const a of ['dtr.generated', 'dtr.regenerated', 'dtr.submitted', 'dtr.review_started', 'dtr.approved', 'dtr.returned', 'policy.required_hours_changed']) {
        assert.ok(got[a] >= 1, `missing audit action ${a}`);
      }
    });
    it('simultaneous approvals produce exactly one approval', async () => {
      const g = await gen('studentB', M2); // no events that month: zero-hour DTR
      assert.equal(g.status, 201);
      const id = g.body.data.id;
      await act('studentB', id, 'submit');
      await act('supervisorB', id, 'start-review');
      const results = await Promise.all(Array.from({ length: 6 }, () => act('supervisorB', id, 'approve')));
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, 409, 409, 409, 409, 409]);
      const ev = await query(`SELECT count(*)::int AS n FROM dtr_events WHERE dtr_id = $1 AND action = 'approved'`, [id]);
      assert.equal(ev.rows[0].n, 1);
    });
    it('simultaneous generate requests never duplicate or skip revisions', async () => {
      const g = await Promise.all(Array.from({ length: 6 }, () => gen('studentA2', M3)));
      assert.ok(g.every((r) => r.status === 201), JSON.stringify(g.map((r) => r.status)));
      const rows = await query(
        `SELECT d.current_revision, (SELECT array_agg(revision_no ORDER BY revision_no) FROM dtr_revisions WHERE dtr_id = d.id) AS revs
         FROM monthly_dtrs d WHERE d.user_id = $1 AND d.month = $2`, [fx.ids.studentA2, M3]);
      assert.equal(rows.rowCount, 1);
      assert.deepEqual(rows.rows[0].revs, [1, 2, 3, 4, 5, 6]);
      assert.equal(rows.rows[0].current_revision, 6);
    });
  });
});
