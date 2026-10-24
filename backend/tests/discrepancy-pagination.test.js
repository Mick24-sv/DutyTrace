import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, makeClient, query, setupTestServer } from './helpers/testEnv.js';

let api, fixtures;
const ctx = setupTestServer({}, async () => {
  api = makeClient(ctx);
  fixtures = await loadFixtures(api);
});

test('discrepancy pages preserve totals, stable ordering, and recipient scope', async () => {
  const { rows: [student] } = await query('SELECT institution_id FROM users WHERE id=$1', [fixtures.ids.studentA]);
  await query(`INSERT INTO attendance_discrepancies
    (institution_id,student_id,office_id,shift_date,discrepancy_type,dedupe_key,detection_reason,detected_at)
    SELECT $1,$2,$3,'2001-01-01','scheduled_no_attendance','pagination-'||n,'Pagination test','2001-01-01T00:00:00Z'
    FROM generate_series(1,16) n`, [student.institution_id, fixtures.ids.studentA, fixtures.officeIds.A]);
  await query(`INSERT INTO attendance_discrepancies
    (institution_id,student_id,office_id,shift_date,discrepancy_type,dedupe_key,detection_reason)
    VALUES ($1,$2,$3,'2001-01-01','scheduled_no_attendance','pagination-other','Other student')`,
    [student.institution_id, fixtures.ids.studentA2, fixtures.officeIds.A]);

  const readPage = async (page) => {
    const result = await api.get(`/attendance-discrepancies?date=2001-01-01&limit=7&page=${page}`, { cookie: fixtures.cookies.studentA });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.total, 16);
    return result.body.data.items.map((item) => item.id);
  };
  const first = await readPage(1), second = await readPage(2), last = await readPage(3);
  assert.deepEqual([first.length, second.length, last.length], [7,7,2]);
  assert.equal(new Set([...first,...second,...last]).size, 16);
  assert.deepEqual(await readPage(1), first, 'timestamp ties must have stable ordering');
  assert.deepEqual(await readPage(4), [], 'empty pages retain the matching total');
  assert.equal((await api.get('/attendance-discrepancies?page=0', { cookie: fixtures.cookies.studentA })).status, 400);
});
