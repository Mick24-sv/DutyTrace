import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, makeClient, setupTestServer } from './helpers/testEnv.js';

let fx;
const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
const as = who => ({ cookie: fx.cookies[who] });
const path = '/users/me/admin-profile';

test('administrators update only their own name and cannot change account privileges', async () => {
  assert.equal((await api.request('PATCH', path, { body: { fullName: 'Updated Administrator' } })).status, 401);
  for (const who of ['studentA', 'supervisorA']) {
    assert.equal((await api.request('PATCH', path, { ...as(who), body: { fullName: 'Unauthorized' } })).status, 403);
  }
  for (const body of [{ fullName: ' ' }, { fullName: 'x'.repeat(121) }, { fullName: 'Updated', role: 'student' }, { fullName: 'Updated', id: fx.ids.studentA }, { fullName: 'Updated', email: 'other@example.test' }]) {
    assert.equal((await api.request('PATCH', path, { ...as('admin'), body })).status, 400);
  }
  const before = (await api.get('/auth/me', as('admin'))).body.data.user;
  const saved = await api.request('PATCH', path, { ...as('admin'), body: { fullName: '  Updated Administrator  ' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.user.fullName, 'Updated Administrator');
  assert.equal(saved.body.data.user.email, before.email);
  assert.equal(saved.body.data.user.role, 'admin');
  assert.equal(saved.body.data.user.institutionId, before.institutionId);
  assert.equal((await api.get('/auth/me', as('admin'))).body.data.user.fullName, 'Updated Administrator');
});

test('administrator profile photos use the existing validated upload and removal flow', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j59kAAAAASUVORK5CYII=', 'base64');
  const uploaded = await api.upload('/users/me/photo', png, { ...as('admin'), filename: 'profile.png' });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.ok(uploaded.body.data.user.photoUrl);
  assert.equal((await api.get(uploaded.body.data.user.photoUrl, as('admin'))).status, 200);
  assert.equal((await api.upload('/users/me/photo', Buffer.from('%PDF-1.4'), { ...as('admin'), filename: 'photo.pdf' })).status, 400);
  const removed = await api.request('DELETE', '/users/me/photo', as('admin'));
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.user.photoUrl, null);
});
