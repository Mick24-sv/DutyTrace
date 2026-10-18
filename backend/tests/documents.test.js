import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { isoDay, loadFixtures, makeClient, query, SAMPLE, setupTestServer } from './helpers/testEnv.js';

const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
let fx;

const as = (who) => ({ cookie: fx.cookies[who] });
const files = () => readdir(ctx.uploadDir);
const download = (who, id) => api.raw('GET', `/documents/${id}/download`, who ? as(who) : {});
const newAbsence = async () => (await api.post('/absences', { ...as('studentA'), body: { absenceType: 'planned', startDate: isoDay(3), reason: 'Family event' } })).body.data.id;

describe('Phase 5 - secure documents', () => {
  let absenceId; let docId; let caseId; let caseDocId; let receiptDocId; let typeId;

  describe('upload validation', () => {
    it('setup', async () => { absenceId = await newAbsence(); });

    it('accepts PDF, PNG and JPEG', async () => {
      for (const [buf, name] of [[SAMPLE.pdf, 'letter.pdf'], [SAMPLE.png, 'photo.png'], [SAMPLE.jpeg, 'photo.jpg']]) {
        const res = await api.upload(`/absences/${absenceId}/documents`, buf, { ...as('studentA'), filename: name });
        assert.equal(res.status, 201, name);
      }
      const d = (await api.get(`/absences/${absenceId}`, as('studentA'))).body.data.documents;
      assert.deepEqual(d.map((x) => x.mimeType), ['application/pdf', 'image/png', 'image/jpeg']);
      docId = d[0].id;
    });
    it('rejects executables, scripts and mismatched types and leaves no file behind', async () => {
      const before = (await files()).length;
      const bad = [
        [SAMPLE.exe, 'letter.pdf'], [SAMPLE.html, 'letter.pdf'], [SAMPLE.html, 'page.html'],
        [SAMPLE.pdf, 'letter.png'], [SAMPLE.pdf, 'letter.exe'], [SAMPLE.png, 'letter.pdf'], [SAMPLE.pdf, 'noextension'],
      ];
      for (const [buf, name] of bad) {
        const res = await api.upload(`/absences/${absenceId}/documents`, buf, { ...as('studentA'), filename: name });
        assert.equal(res.status, 400, name);
        assert.equal(res.body.error.code, 'BAD_FILE_TYPE', name);
      }
      assert.equal((await files()).length, before);
    });
    it('rejects an empty body and a missing file name', async () => {
      const empty = await api.raw('POST', `/absences/${absenceId}/documents?filename=a.pdf`, { ...as('studentA'), body: Buffer.alloc(0), headers: { 'content-type': 'application/octet-stream' } });
      assert.equal(empty.status, 400);
      const noName = await api.raw('POST', `/absences/${absenceId}/documents`, { ...as('studentA'), body: SAMPLE.pdf, headers: { 'content-type': 'application/octet-stream' } });
      assert.equal(noName.status, 400);
    });
    it('rejects files over the size limit (413) and accepts files just under it', async () => {
      const keep = env.maxUploadBytes;
      env.maxUploadBytes = 2048;
      try {
        const big = Buffer.concat([SAMPLE.pdf, Buffer.alloc(4096)]);
        const res = await api.upload(`/absences/${absenceId}/documents`, big, { ...as('studentA') });
        assert.equal(res.status, 413);
        assert.equal(res.body.error.code, 'FILE_TOO_LARGE');
        const fine = Buffer.concat([SAMPLE.pdf, Buffer.alloc(1500)]);
        assert.equal((await api.upload(`/absences/${absenceId}/documents`, fine, { ...as('studentA') })).status, 201);
      } finally { env.maxUploadBytes = keep; }
    });
    it('caps the number of documents per record and leaves no orphan file', async () => {
      const id = await newAbsence();
      const keep = env.maxDocsPerRecord;
      env.maxDocsPerRecord = 2;
      try {
        assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA') })).status, 201);
        assert.equal((await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA') })).status, 201);
        const before = (await files()).length;
        const res = await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA') });
        assert.equal(res.status, 409);
        assert.equal(res.body.error.code, 'TOO_MANY_DOCUMENTS');
        assert.equal((await files()).length, before, 'the refused upload was removed from disk');
      } finally { env.maxDocsPerRecord = keep; }
    });
    it('uploads to someone else\'s record are refused before anything is written', async () => {
      const before = (await files()).length;
      assert.equal((await api.upload(`/absences/${absenceId}/documents`, SAMPLE.pdf, { ...as('studentA2') })).status, 403);
      assert.equal((await files()).length, before);
    });
  });

  describe('private storage', () => {
    it('files are stored under random UUID names, owner-only, with the exact bytes', async () => {
      const id = await newAbsence();
      const res = await api.upload(`/absences/${id}/documents`, SAMPLE.pdf, { ...as('studentA'), filename: '../../etc/passwd.pdf' });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.documents[0].fileName, 'passwd.pdf', 'path parts are stripped from the display name');
      const { rows } = await query(`SELECT stored_name, sha256, size_bytes FROM documents WHERE absence_id = $1`, [id]);
      const stored = rows[0].stored_name;
      assert.match(stored, /^[0-9a-f-]{36}$/);
      assert.ok((await files()).includes(stored));
      assert.deepEqual(await readFile(path.join(ctx.uploadDir, stored)), SAMPLE.pdf);
      if (process.platform !== 'win32') {
        assert.equal((await stat(path.join(ctx.uploadDir, stored))).mode & 0o777, 0o600);
      }
      assert.equal(rows[0].size_bytes, SAMPLE.pdf.length);
      assert.equal(rows[0].sha256.length, 64);
      assert.equal(JSON.stringify(res.body).includes(stored), false, 'the stored name never reaches the client');
      assert.equal(JSON.stringify(res.body).includes(rows[0].sha256), false);
    });
    it('there is no public route to the files', async () => {
      const [stored] = await files();
      for (const p of [`/uploads/${stored}`, `/api/uploads/${stored}`, `/api/documents/${stored}`, `/${stored}`, `/api/files/${stored}`]) {
        const res = await fetch(`${ctx.base}${p}`, { headers: { cookie: fx.cookies.admin } });
        assert.ok([401, 400, 403, 404].includes(res.status), `${p} -> ${res.status}`);
        assert.equal((res.headers.get('content-type') ?? '').includes('pdf'), false, p);
      }
    });
  });

  describe('downloads: who may read a file', () => {
    it('the owner gets the exact bytes with safe headers', async () => {
      const res = await download('studentA', docId);
      assert.equal(res.status, 200);
      assert.deepEqual(res.buffer, SAMPLE.pdf);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition'), /^attachment; filename="letter\.pdf"/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('cache-control'), 'private, no-store');
      assert.match(res.headers.get('content-security-policy'), /sandbox/);
      assert.equal(Number(res.headers.get('content-length')), SAMPLE.pdf.length);
    });
    it('the office supervisor and an administrator may read it', async () => {
      assert.equal((await download('supervisorA', docId)).status, 200);
      assert.equal((await download('admin', docId)).status, 200);
    });
    it('other students, other offices and anonymous callers may not; nothing leaks in the refusal', async () => {
      for (const [who, status] of [['studentA2', 403], ['studentB', 403], ['supervisorB', 403], [null, 401]]) {
        const res = await download(who, docId);
        assert.equal(res.status, status, String(who));
        assert.equal(res.headers.get('content-type').includes('pdf'), false);
        assert.equal(res.buffer.includes(SAMPLE.pdf), false);
      }
    });
    it('unknown and malformed ids', async () => {
      assert.equal((await download('studentA', '00000000-0000-4000-8000-000000000000')).status, 403);
      assert.equal((await download('studentA', 'not-an-id')).status, 400);
    });
    it('every download is audited with who read it', async () => {
      const { rows } = await query(`SELECT actor_id FROM audit_logs WHERE action = 'document.downloaded' AND target_id = $1`, [docId]);
      const actors = rows.map((r) => r.actor_id);
      for (const who of ['studentA', 'supervisorA', 'admin']) assert.ok(actors.includes(fx.ids[who]), who);
      assert.equal(actors.includes(fx.ids.studentA2), false, 'refused requests are not downloads');
    });
    it('a record recorded by staff without a file has nothing to download', async () => {
      await api.post(`/absences/${absenceId}/receipts`, { ...as('supervisorA'), body: { method: 'email', receivedDate: isoDay(-1) } });
      const d = (await api.get(`/absences/${absenceId}`, as('studentA'))).body.data.documents.find((x) => x.method === 'email');
      receiptDocId = d.id;
      const own = await download('studentA', receiptDocId);
      assert.equal(own.status, 404);
      assert.equal(JSON.parse(own.buffer.toString()).error.code, 'NO_FILE');
      assert.equal((await download('studentA2', receiptDocId)).status, 403, 'strangers cannot even learn that it exists');
    });
  });

  describe('case documents follow the same rules', () => {
    it('setup: an administrator opens a case with a required document', async () => {
      const types = await api.get('/cases/types', as('admin'));
      typeId = types.body.data.types.find((t) => t.code === 'DEMO-HOURS').id;
      const c = await api.post('/cases', { ...as('admin'), body: { userId: fx.ids.studentA, caseTypeId: typeId, description: 'Below the configured hours', periodStart: isoDay(-40), periodEnd: isoDay(-10) } });
      assert.equal(c.status, 201);
      caseId = c.body.data.id;
    });
    it('the student uploads against a requirement; strangers cannot read it', async () => {
      const detail = (await api.get(`/cases/${caseId}`, as('studentA'))).body.data;
      const res = await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as('studentA'), filename: 'explanation.pdf', query: `&requirementId=${detail.requirements[0].id}` });
      assert.equal(res.status, 201);
      caseDocId = res.body.data.documents[0].id;
      assert.equal(res.body.data.documents[0].requirementId, detail.requirements[0].id);
      assert.deepEqual((await download('studentA', caseDocId)).buffer, SAMPLE.pdf);
      assert.equal((await download('admin', caseDocId)).status, 200);
      assert.equal((await download('supervisorA', caseDocId)).status, 200);
      for (const who of ['studentA2', 'studentB', 'supervisorB']) assert.equal((await download(who, caseDocId)).status, 403, who);
      assert.equal((await download(null, caseDocId)).status, 401);
    });
    it('a requirement from another case cannot be used', async () => {
      const other = await api.post('/cases', { ...as('admin'), body: { userId: fx.ids.studentA2, caseTypeId: typeId, description: 'Other student', periodStart: isoDay(-40), periodEnd: isoDay(-10) } });
      const otherReq = other.body.data.requirements[0].id;
      const res = await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as('studentA'), query: `&requirementId=${otherReq}` });
      assert.equal(res.status, 400);
    });
    it('a student cannot upload to another student\'s case, nor a supervisor/admin on their behalf', async () => {
      for (const who of ['studentA2', 'supervisorA', 'admin']) {
        assert.equal((await api.upload(`/cases/${caseId}/documents`, SAMPLE.pdf, { ...as(who) })).status, 403, who);
      }
    });
  });

  describe('database guards on documents', () => {
    it('documents are append-only and must be a complete, single-parent record', async () => {
      await assert.rejects(query(`UPDATE documents SET original_name = 'x' WHERE id = $1`, [docId]), /append-only/);
      await assert.rejects(query('DELETE FROM documents WHERE id = $1', [docId]), /append-only/);
      await assert.rejects(query('TRUNCATE documents CASCADE'), /cannot be truncated/);
      // both parents, or neither
      await assert.rejects(query(
        `INSERT INTO documents (owner_id, absence_id, case_id, method, received_date, received_by, uploaded_by)
         VALUES ($1, $2, $3, 'email', current_date, $4, $4)`, [fx.ids.studentA, absenceId, caseId, fx.ids.supervisorA]));
      // an online submission must carry a file
      await assert.rejects(query(`INSERT INTO documents (owner_id, absence_id, method, uploaded_by) VALUES ($1, $2, 'online', $1)`, [fx.ids.studentA, absenceId]));
      // a manual receipt must say when and by whom
      await assert.rejects(query(`INSERT INTO documents (owner_id, absence_id, method, uploaded_by) VALUES ($1, $2, 'email', $3)`, [fx.ids.studentA, absenceId, fx.ids.supervisorA]));
    });
  });
});
