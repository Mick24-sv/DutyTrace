import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, shiftDate, eventsForDay, agendaItemsForDay, ROLE_AGENDAS } from '../src/utils/sidebarCalendar.js';

test('month grids align weekdays and include leap days', () => {
  const days = monthDays('2028-02');
  assert.equal(days.indexOf('2028-02-01'), 2);
  assert.ok(days.includes('2028-02-29'));
  assert.equal(days.length % 7, 0);
  assert.ok(!monthDays('2027-02').includes('2027-02-29'));
});
test('keyboard day navigation crosses year and month boundaries', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
});
test('dots and agenda use approved shifts within their effective dates', () => {
  const schedule = { id: 'one', status: 'approved', effectiveStartsOn: '2026-11-01', effectiveEndsOn: '2026-11-30', days: [{ weekday: 4, startsAt: '08:00', endsAt: '12:00', afternoonStartsAt: '13:00', afternoonEndsAt: '17:00' }] };
  assert.equal(eventsForDay([schedule], '2026-11-12').length, 2);
  assert.equal(eventsForDay([schedule], '2026-11-13').length, 0);
  assert.equal(eventsForDay([schedule], '2026-12-03').length, 0);
  assert.equal(eventsForDay([{ ...schedule, status: 'pending_review' }], '2026-11-12').length, 0);
});

test('each role has its own agenda heading and students see their duty periods', () => {
  assert.equal(new Set(Object.values(ROLE_AGENDAS).map(agenda => agenda.heading)).size, 3);
  const schedule = { id: 'one', studentName: 'Student One', status: 'approved', effectiveStartsOn: '2026-11-01', effectiveEndsOn: '2026-11-30', days: [{ weekday: 4, startsAt: '08:00', endsAt: '12:00', afternoonStartsAt: '13:00', afternoonEndsAt: '17:00' }] };
  assert.deepEqual(eventsForDay([schedule], '2026-11-12', 'student').map(event => event.title), ['Morning duty', 'Afternoon duty']);
  assert.equal(eventsForDay([schedule], '2026-11-12', 'supervisor')[0].title, 'Student One');
});

test('admin agenda never shows duty shifts and filters important items by selected date', () => {
  const schedule = { id: 'one', studentName: 'Student One', status: 'approved', effectiveStartsOn: '2026-11-01', effectiveEndsOn: '2026-11-30', days: [{ weekday: 4, startsAt: '08:00', endsAt: '12:00' }] };
  const items = [{ id: 'concern-one', date: '2026-11-12', kind: 'concern' }, { id: 'deadline-one', date: '2026-11-13', kind: 'deadline' }];
  assert.deepEqual(eventsForDay([schedule], '2026-11-12', 'admin'), []);
  assert.deepEqual(agendaItemsForDay([schedule], items, '2026-11-12', 'admin'), [items[0]]);
  assert.equal(agendaItemsForDay([schedule], items, '2026-11-12', 'supervisor').length, 1);
});
