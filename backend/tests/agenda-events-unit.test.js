import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaEventSchema } from '../src/modules/duty-requirements/agenda-events.rules.js';
import { personalEventsForMonth, savePersonalEvent, deletePersonalEvent } from '../src/modules/duty-requirements/agenda-events.service.js';

const actor = { id: 'owner-one', institutionId: 'institution-one', role: 'student' };
const event = { title: 'Study session', date: '2026-11-12', allDay: true, startsAt: null, endsAt: null, notes: 'Bring notes' };

test('personal events validate real dates, required titles, limits and all-day times', () => {
  assert.equal(agendaEventSchema.safeParse(event).success, true);
  for (const changes of [{ title: '  ' }, { title: 'x'.repeat(161) }, { notes: 'x'.repeat(2001) }, { date: '2026-02-30' }, { startsAt: '09:00' }, { ownerId: 'another-user' }]) {
    assert.equal(agendaEventSchema.safeParse({ ...event, ...changes }).success, false, JSON.stringify(changes));
  }
});

test('timed events require a same-day end later than the start', () => {
  assert.equal(agendaEventSchema.safeParse({ ...event, allDay: false, startsAt: '09:00', endsAt: '10:00' }).success, true);
  for (const [start, end] of [['09:00', '09:00'], ['23:00', '01:00'], [null, '10:00'], ['25:00', '26:00']]) {
    assert.equal(agendaEventSchema.safeParse({ ...event, allDay: false, startsAt: start, endsAt: end }).success, false);
  }
});

test('all roles read personal events using authenticated owner and institution', async () => {
  for (const role of ['student', 'supervisor', 'admin']) {
    let captured;
    const result = await personalEventsForMonth({ actor: { ...actor, role }, month: '2026-11' }, { query: async (sql, params) => {
      captured = { sql, params }; return { rows: [event] };
    } });
    assert.match(captured.sql, /institution_id=\$1 AND owner_id=\$2/);
    assert.deepEqual(captured.params, ['institution-one', 'owner-one', '2026-11-01']);
    assert.deepEqual(result.events, [event]);
  }
});

test('creation assigns the authenticated owner; updates cannot bypass ownership', async () => {
  let captured;
  const saved = await savePersonalEvent({ actor, event }, { query: async (sql, params) => {
    captured = { sql, params }; return { rows: [{ id: 'new-event', ...event }] };
  } });
  assert.deepEqual(captured.params.slice(0, 2), ['institution-one', 'owner-one']);
  assert.equal(saved.id, 'new-event');
  await assert.rejects(savePersonalEvent({ actor, id: 'someone-elses-event', event }, { query: async (sql, params) => {
    assert.match(sql, /WHERE institution_id=\$1 AND owner_id=\$2 AND id=\$9/);
    assert.equal(params[8], 'someone-elses-event');
    return { rows: [] };
  } }), { status: 404 });
});

test('deletion checks owner and institution and does not disclose missing events', async () => {
  await assert.rejects(deletePersonalEvent({ actor, id: 'private-event' }, { query: async (sql, params) => {
    assert.match(sql, /WHERE institution_id=\$1 AND owner_id=\$2 AND id=\$3/);
    assert.deepEqual(params, ['institution-one', 'owner-one', 'private-event']);
    return { rowCount: 0 };
  } }), { status: 404 });
});
