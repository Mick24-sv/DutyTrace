import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, makeClient, setupTestServer } from './helpers/testEnv.js';

let fx;
const ctx = setupTestServer({}, async () => { fx = await loadFixtures(api); });
const api = makeClient(ctx);
const path = '/duty-schedules/agenda/events';
const as = who => ({ cookie: fx.cookies[who] });
const event = { title: 'Personal reminder', date: '2026-11-12', allDay: false, startsAt: '09:00', endsAt: '10:00', notes: 'Private notes' };

test('each role can manage only their own personal events', async () => {
  assert.equal((await api.get(`${path}?month=2026-11`)).status, 401);
  for (const who of ['studentA', 'supervisorA', 'admin']) {
    const created = await api.post(path, { ...as(who), body: event });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.event.id;
    const own = await api.get(`${path}?month=2026-11`, as(who));
    assert.ok(own.body.data.events.some(row => row.id === id));
    assert.ok(!(await api.get(`${path}?month=2026-12`, as(who))).body.data.events.some(row => row.id === id));
    for (const other of ['studentA', 'supervisorA', 'admin'].filter(value => value !== who)) {
      assert.ok(!(await api.get(`${path}?month=2026-11`, as(other))).body.data.events.some(row => row.id === id));
      assert.equal((await api.put(`${path}/${id}`, { ...as(other), body: event })).status, 404);
      assert.equal((await api.request('DELETE', `${path}/${id}`, as(other))).status, 404);
    }
    const updated = await api.put(`${path}/${id}`, { ...as(who), body: { ...event, title: 'Updated reminder', allDay: true, startsAt: null, endsAt: null } });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.event.allDay, true);
    assert.equal((await api.request('DELETE', `${path}/${id}`, as(who))).status, 200);
    assert.ok(!(await api.get(`${path}?month=2026-11`, as(who))).body.data.events.some(row => row.id === id));
  }
});

test('invalid event data and forged ownership are rejected', async () => {
  assert.equal((await api.post(path, { ...as('studentA'), body: { ...event, ownerId: fx.ids.admin } })).status, 400);
  assert.equal((await api.post(path, { ...as('admin'), body: { ...event, date: '2026-02-30' } })).status, 400);
  assert.equal((await api.post(path, { ...as('supervisorA'), body: { ...event, endsAt: '08:00' } })).status, 400);
  assert.equal((await api.get(`${path}?month=2026-13`, as('studentA'))).status, 400);
});
