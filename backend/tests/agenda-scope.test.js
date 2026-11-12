import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaForMonth } from '../src/modules/duty-requirements/agenda.service.js';

const actor = { id: 'student-one', institutionId: 'institution-one', office: { id: 'office-one' } };
function capture() {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
}
test('student agenda is restricted to the authenticated student and institution', async () => {
  const db = capture();
  const result = await agendaForMonth({ actor: { ...actor, role: 'student' }, month: '2026-11' }, db);
  assert.equal(result.scope, 'personal');
  assert.deepEqual(db.calls[0].params, ['institution-one', '2026-11-01', 'student-one']);
  assert.match(db.calls[0].sql, /s\.student_id=\$3/);
  assert.match(db.calls[0].sql, /s\.institution_id=\$1/);
});
test('supervisor agenda is restricted to the assigned office and institution', async () => {
  const db = capture();
  const result = await agendaForMonth({ actor: { ...actor, role: 'supervisor' }, month: '2026-11' }, db);
  assert.equal(result.scope, 'office');
  assert.deepEqual(db.calls[0].params, ['institution-one', '2026-11-01', 'office-one']);
  assert.match(db.calls[0].sql, /s\.office_id=\$3/);
});
test('supervisor without an office receives no schedules and makes no query', async () => {
  const db = capture();
  const result = await agendaForMonth({ actor: { ...actor, role: 'supervisor', office: null }, month: '2026-11' }, db);
  assert.deepEqual(result.schedules, []);
  assert.equal(db.calls.length, 0);
});
test('administrator agenda returns important items instead of student shifts', async () => {
  const db = capture();
  const result = await agendaForMonth({ actor: { ...actor, role: 'admin' }, month: '2027-02' }, db);
  assert.equal(result.scope, 'institution');
  assert.deepEqual(result.schedules, []);
  assert.deepEqual(result.importantItems, []);
  assert.deepEqual(db.calls[0].params, ['institution-one', '2027-02-01', 'student-one', 'Asia/Manila']);
  assert.match(db.calls[0].sql, /c\.institution_id=\$1/);
  assert.match(db.calls[0].sql, /p\.user_id=\$3 AND NOT p\.archived AND NOT p\.deleted/);
  assert.match(db.calls[0].sql, /t\.institution_id=\$1/);
  assert.match(db.calls[0].sql, /completion_deadline/);
  assert.doesNotMatch(db.calls[0].sql, /student_duty_schedules/);
});
test('unknown roles cannot query an agenda', async () => {
  const db = capture();
  await assert.rejects(agendaForMonth({ actor: { ...actor, role: 'guest' }, month: '2026-11' }, db), { status: 403 });
  assert.equal(db.calls.length, 0);
});
