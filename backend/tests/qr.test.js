import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activePayload, loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';
import { buildPayload, readPayload } from '../src/modules/qr/qr.service.js';

let api;
let fx;
const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
api = makeClient(ctx);

const UUID = '3f2b8f0e-7a41-4c0e-9f3a-5d2e6b1a9c10';

describe('QR payload signing', () => {
  test('a built payload reads back to the same id', () => {
    assert.equal(readPayload(buildPayload(UUID)), UUID);
    assert.equal(readPayload(`  ${buildPayload(UUID)}\n`), UUID, 'surrounding whitespace is tolerated');
  });

  test('tampered, re-signed-with-wrong-key, truncated and malformed payloads are rejected', () => {
    const good = buildPayload(UUID);
    const [prefix, id, sig] = good.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    assert.equal(readPayload(`${prefix}.${id}.${flipped}`), null, 'edited signature');
    assert.equal(readPayload(`${prefix}.3f2b8f0e-7a41-4c0e-9f3a-5d2e6b1a9c11.${sig}`), null, 'signature for a different id');
    assert.equal(readPayload(`${prefix}.${id}.${sig.slice(0, 10)}`), null, 'truncated signature');
    assert.equal(readPayload(`XX1.${id}.${sig}`), null, 'wrong prefix');
    assert.equal(readPayload(`${prefix}.not-a-uuid.${sig}`), null, 'bad id');
    assert.equal(readPayload(good + '.extra'), null, 'extra part');
    assert.equal(readPayload(''), null);
    assert.equal(readPayload(null), null);
    assert.equal(readPayload({ toString: () => good }), null, 'non-strings');
    assert.equal(readPayload('x'.repeat(500)), null, 'oversized input');
  });
});

describe('admin QR management', () => {
  test('only administrators can view or change QR codes', async () => {
    for (const who of ['studentA', 'supervisorA']) {
      assert.equal((await api.get(`/offices/${fx.officeIds.A}/qr`, { cookie: fx.cookies[who] })).status, 403);
      assert.equal((await api.post(`/offices/${fx.officeIds.A}/qr`, { cookie: fx.cookies[who] })).status, 403);
      assert.equal((await api.post(`/offices/${fx.officeIds.A}/qr/regenerate`, { cookie: fx.cookies[who] })).status, 403);
      assert.equal((await api.post(`/offices/${fx.officeIds.A}/qr/revoke`, { cookie: fx.cookies[who] })).status, 403);
    }
    assert.equal((await api.get(`/offices/${fx.officeIds.A}/qr`)).status, 401);
  });

  test('the seeded office has an active code whose payload is valid and signed', async () => {
    const res = await api.get(`/offices/${fx.officeIds.A}/qr`, { cookie: fx.cookies.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.office.code, 'DEMO-A');
    assert.equal(res.body.data.active.active, true);
    assert.equal(readPayload(res.body.data.active.payload), res.body.data.active.id);
  });

  test('bad and unknown office ids return 400 and 404', async () => {
    assert.equal((await api.get('/offices/nope/qr', { cookie: fx.cookies.admin })).status, 400);
    assert.equal((await api.get('/offices/00000000-0000-4000-8000-000000000000/qr', { cookie: fx.cookies.admin })).status, 404);
  });

  test('generate refuses when an active code exists', async () => {
    const res = await api.post(`/offices/${fx.officeIds.A}/qr`, { cookie: fx.cookies.admin });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'QR_EXISTS');
  });

  test('regenerate replaces the code: old payload stops working immediately, new one works', async () => {
    const oldPayload = await activePayload(api, fx.cookies.admin, fx.officeIds.B);
    const res = await api.post(`/offices/${fx.officeIds.B}/qr/regenerate`, { cookie: fx.cookies.admin });
    assert.equal(res.status, 200);
    const newPayload = res.body.data.active.payload;
    assert.notEqual(newPayload, oldPayload);
    assert.equal(res.body.data.history.length, 1);
    assert.equal(res.body.data.history[0].active, false);

    const oldScan = await api.post('/attendance/scan', { cookie: fx.cookies.studentB, body: { action: 'time_in', qrPayload: oldPayload } });
    assert.equal(oldScan.status, 400);
    assert.equal(oldScan.body.error.code, 'QR_REVOKED');

    const newScan = await api.post('/attendance/scan', { cookie: fx.cookies.studentB, body: { action: 'time_in', qrPayload: newPayload } });
    assert.equal(newScan.status, 201);
  });

  test('revoke leaves the office with no valid code; scanning fails until a new one is generated', async () => {
    const payload = await activePayload(api, fx.cookies.admin, fx.officeIds.A);
    const revoked = await api.post(`/offices/${fx.officeIds.A}/qr/revoke`, { cookie: fx.cookies.admin });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.active, null);

    const scan = await api.post('/attendance/scan', { cookie: fx.cookies.studentA, body: { action: 'time_in', qrPayload: payload } });
    assert.equal(scan.status, 400);
    assert.equal(scan.body.error.code, 'QR_REVOKED');

    const again = await api.post(`/offices/${fx.officeIds.A}/qr/revoke`, { cookie: fx.cookies.admin });
    assert.equal(again.status, 409);

    const gen = await api.post(`/offices/${fx.officeIds.A}/qr`, { cookie: fx.cookies.admin });
    assert.equal(gen.status, 201);
    assert.notEqual(gen.body.data.active.payload, payload);
  });

  test('the database allows only one active code per office', async () => {
    await assert.rejects(
      query('INSERT INTO office_qr_codes (office_id) VALUES ($1)', [fx.officeIds.A]),
      /office_qr_one_active_per_office/,
    );
  });

  test('generate, regenerate and revoke are audited', async () => {
    const { rows } = await query("SELECT action FROM audit_logs WHERE action LIKE 'qr.%' ORDER BY id");
    const actions = rows.map((r) => r.action);
    assert.ok(actions.includes('qr.regenerate'));
    assert.ok(actions.includes('qr.revoke'));
    assert.ok(actions.includes('qr.generate'));
    const { rows: regen } = await query("SELECT before_data, after_data FROM audit_logs WHERE action = 'qr.regenerate'");
    assert.ok(regen[0].before_data.qrCodeId && regen[0].after_data.qrCodeId);
    assert.notEqual(regen[0].before_data.qrCodeId, regen[0].after_data.qrCodeId);
  });

  test('payloads are not stored in the database (they are derived from the id)', async () => {
    const { rows } = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'office_qr_codes'");
    assert.ok(!rows.some((r) => /payload|token|secret/i.test(r.column_name)));
  });
});
