import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTestServer, makeClient, loadFixtures, query } from './helpers/testEnv.js';
import { createNotification } from '../src/modules/notifications/notifications.service.js';
import { runReminderSweep } from '../src/modules/notifications/reminders.service.js';

let api;
let fixtures;
const ctx = setupTestServer({}, async () => {
  api = makeClient(ctx);
  fixtures = await loadFixtures(api);
});

const createFor = (recipientId, institutionId, dedupeKey, extras = {}) => createNotification({ query }, {
  recipientId, institutionId, type: 'test_notice', title: 'Test notice', message: 'Notification body',
  dedupeKey, ...extras,
});

test('notification center returns only recipient notifications and enforces ownership on reads', async () => {
  const institution = await query('SELECT institution_id FROM users WHERE id = $1', [fixtures.ids.studentA]);
  await createFor(fixtures.ids.studentA, institution.rows[0].institution_id, 'student-a-one', { important: true });
  await createFor(fixtures.ids.studentA, institution.rows[0].institution_id, 'student-a-one', { important: true });
  await createFor(fixtures.ids.studentA2, institution.rows[0].institution_id, 'student-a2-one');
  const foreignInstitution = await query(
    `INSERT INTO institutions (name, timezone) VALUES ('Notification Isolation ' || gen_random_uuid()::text, 'UTC') RETURNING id`,
  );
  await createFor(fixtures.ids.studentA, foreignInstitution.rows[0].id, 'foreign-institution-one');

  const list = await api.get('/notifications?filter=unread', { cookie: fixtures.cookies.studentA });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.notifications.length, 1);
  assert.equal(list.body.data.unreadCount, 1);

  const otherUser = await api.request('PATCH', `/notifications/${list.body.data.notifications[0].id}/read`, { cookie: fixtures.cookies.studentA2, body: {} });
  assert.equal(otherUser.status, 404);
  const mark = await api.request('PATCH', `/notifications/${list.body.data.notifications[0].id}/read`, { cookie: fixtures.cookies.studentA, body: {} });
  assert.equal(mark.status, 200);
  const empty = await api.get('/notifications?filter=unread', { cookie: fixtures.cookies.studentA });
  assert.equal(empty.body.data.unreadCount, 0);
  assert.equal(empty.body.data.notifications.length, 0);
  const ownInstitution = await api.get('/notifications?filter=all', { cookie: fixtures.cookies.studentA });
  assert.equal(ownInstitution.body.data.notifications.length, 1);
});

test('mark all read is scoped to the signed-in recipient', async () => {
  const institution = await query('SELECT institution_id FROM users WHERE id = $1', [fixtures.ids.studentA]);
  const before = await api.get('/notifications?filter=unread', { cookie: fixtures.cookies.studentA2 });
  await createFor(fixtures.ids.studentA, institution.rows[0].institution_id, 'mark-all-a');
  await createFor(fixtures.ids.studentA2, institution.rows[0].institution_id, 'mark-all-a2');
  const res = await api.request('PATCH', '/notifications/read-all', { cookie: fixtures.cookies.studentA, body: {} });
  assert.equal(res.status, 200);
  const other = await api.get('/notifications?filter=unread', { cookie: fixtures.cookies.studentA2 });
  assert.equal(other.body.data.unreadCount, before.body.data.unreadCount + 1);
});

test('semester reminders use each assigned requirement, respect term timezone, and deduplicate repeated sweeps', async () => {
  const { rows: instRows } = await query('SELECT institution_id FROM users WHERE id = $1', [fixtures.ids.studentA]);
  const institutionId = instRows[0].institution_id;
  const { rows: dayRows } = await query(`SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS today`);
  const day = (offset) => new Date(`${dayRows[0].today}T00:00:00Z`).getTime() + offset * 86400000;
  const shiftDay = (offset) => new Date(day(offset)).toISOString().slice(0, 10);
  const startsOn = shiftDay(-10);
  const deadline = shiftDay(7);
  const { rows: termRows } = await query(
    `INSERT INTO academic_terms (institution_id, academic_year, semester, starts_on, ends_on, completion_deadline, timezone, created_by)
     VALUES ($1, 'Notification Test', 'first', $2, $3, $4, 'Asia/Manila', $5) RETURNING id`,
    [institutionId, startsOn, shiftDay(20), deadline, fixtures.ids.admin],
  );
  const termId = termRows[0].id;
  await query(
    `INSERT INTO semester_requirement_assignments (term_id, student_id, office_id, required_hours, assigned_by)
     VALUES ($1, $2, $3, 80, $5), ($1, $4, $3, 120, $5)`,
    [termId, fixtures.ids.studentA, fixtures.officeIds.A, fixtures.ids.studentA2, fixtures.ids.admin],
  );
  const approvedDtr = async (studentId, officeId, month, timeIn, seconds) => {
    const { rows } = await query(
      `INSERT INTO monthly_dtrs (user_id, office_id, month, status, verified_seconds, verified_revision, decided_by, decided_at)
       VALUES ($1, $2, $3, 'approved', $4, 1, $5, now()) RETURNING id`,
      [studentId, officeId, month, seconds, fixtures.ids.admin],
    );
    await query(
      `INSERT INTO dtr_revisions (dtr_id, revision_no, snapshot, generated_by)
       VALUES ($1, 1, $2::jsonb, $3)`,
      [rows[0].id, JSON.stringify({ days: [{ sessions: [{ counted: true, timeIn, seconds }] }] }), studentId],
    );
  };
  await approvedDtr(fixtures.ids.studentA, fixtures.officeIds.A, dayRows[0].today.slice(0, 7), `${dayRows[0].today}T09:00:00+08:00`, 20 * 3600);
  await approvedDtr(fixtures.ids.studentA2, fixtures.officeIds.A, startsOn.slice(0, 7), `${shiftDay(-11)}T09:00:00+08:00`, 200 * 3600);

  const firstSweep = await runReminderSweep();
  assert.equal(firstSweep.deadlineAssignmentsChecked, 2);
  const allNotices = await query(
    `SELECT recipient_id, message FROM notifications WHERE type = 'semester_requirement_approaching' ORDER BY recipient_id`,
  );
  assert.equal(allNotices.rows.length, 4, 'each of the two students and two administrators receives a notice');
  const studentNotices = { rows: allNotices.rows.filter((row) => [fixtures.ids.studentA, fixtures.ids.studentA2].includes(row.recipient_id)) };
  assert.equal(studentNotices.rows.length, 2);
  const messages = new Map(studentNotices.rows.map((row) => [row.recipient_id, row.message]));
  assert.match(messages.get(fixtures.ids.studentA), /60\.00 verified hours remaining/);
  assert.match(messages.get(fixtures.ids.studentA2), /120\.00 verified hours remaining/);

  await runReminderSweep();
  const count = await query(`SELECT count(*)::int AS n FROM notifications WHERE type = 'semester_requirement_approaching'`);
  assert.equal(count.rows[0].n, 4);
  const notices = await api.get('/notifications?filter=important', { cookie: fixtures.cookies.admin });
  assert.equal(notices.status, 200);
  assert.ok(notices.body.data.notifications.some((item) => item.type === 'semester_assignment_missing' && item.relatedId === fixtures.ids.studentB));
  const studentList = await api.get('/notifications', { cookie: fixtures.cookies.studentB });
  assert.equal(studentList.body.data.notifications.some((item) => item.type === 'semester_assignment_missing'), false);

  const { rows: futureTerm } = await query(
    `INSERT INTO academic_terms (institution_id, academic_year, semester, starts_on, ends_on, timezone, created_by)
     VALUES ($1, 'No Deadline Test', 'second', $2, $3, 'Asia/Manila', $4) RETURNING id`,
    [institutionId, shiftDay(21), shiftDay(50), fixtures.ids.admin],
  );
  await query(
    `INSERT INTO semester_requirement_assignments (term_id, student_id, office_id, required_hours, assigned_by)
     VALUES ($1, $2, $3, 210, $4)`,
    [futureTerm[0].id, fixtures.ids.studentB, fixtures.officeIds.A, fixtures.ids.admin],
  );
  await runReminderSweep();
  const noDeadline = await query(
    `SELECT count(*)::int AS n FROM notifications
     WHERE recipient_id = $1 AND type LIKE 'semester_requirement_%'`, [fixtures.ids.studentB],
  );
  assert.equal(noDeadline.rows[0].n, 0);

  const policy = await api.put('/dtrs/policy', {
    cookie: fixtures.cookies.admin,
    body: { requiredMonthlyHours: 40, reviewSlaHours: 24 },
  });
  assert.equal(policy.status, 200);
  assert.equal(policy.body.data.reviewSlaHours, 24);
  const createdDtr = await query(
    `INSERT INTO monthly_dtrs (user_id, office_id, month, status) VALUES ($1, $2, $3, 'submitted') RETURNING id`,
    [fixtures.ids.studentB, fixtures.officeIds.B, dayRows[0].today.slice(0, 7)],
  );
  await query(
    'INSERT INTO dtr_revisions (dtr_id, revision_no, snapshot, generated_by) VALUES ($1, 1, $2::jsonb, $3)',
    [createdDtr.rows[0].id, JSON.stringify({ days: [], policy: {} }), fixtures.ids.studentB],
  );
  await query(
    `INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id, created_at)
     VALUES ($1, 1, 'submitted', 'draft', 'submitted', $2, now() - interval '30 hours')`,
    [createdDtr.rows[0].id, fixtures.ids.studentB],
  );
  const approachingDtr = await query(
    `INSERT INTO monthly_dtrs (user_id, office_id, month, status) VALUES ($1, $2, '2000-01', 'submitted') RETURNING id`,
    [fixtures.ids.studentA, fixtures.officeIds.A],
  );
  await query(
    'INSERT INTO dtr_revisions (dtr_id, revision_no, snapshot, generated_by) VALUES ($1, 1, $2::jsonb, $3)',
    [approachingDtr.rows[0].id, JSON.stringify({ days: [], policy: {} }), fixtures.ids.studentA],
  );
  await query(
    `INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id, created_at)
     VALUES ($1, 1, 'submitted', 'draft', 'submitted', $2, now() - interval '12 hours')`,
    [approachingDtr.rows[0].id, fixtures.ids.studentA],
  );
  await runReminderSweep();
  const reviewNotice = await query(
    `SELECT recipient_id FROM notifications WHERE type = 'dtr_review_overdue' AND related_id = $1`, [createdDtr.rows[0].id],
  );
  assert.ok(reviewNotice.rows.some((row) => row.recipient_id === fixtures.ids.supervisorB));
  const approachingNotice = await query(
    `SELECT recipient_id FROM notifications WHERE type = 'dtr_review_approaching' AND related_id = $1`, [approachingDtr.rows[0].id],
  );
  assert.ok(approachingNotice.rows.some((row) => row.recipient_id === fixtures.ids.supervisorA));
  await runReminderSweep();
  const dedupedReview = await query(
    `SELECT count(*)::int AS n FROM notifications WHERE type = 'dtr_review_overdue' AND related_id = $1`, [createdDtr.rows[0].id],
  );
  assert.equal(dedupedReview.rows[0].n, 1);
});

test('unauthenticated callers cannot read notifications and invalid filters are rejected', async () => {
  assert.equal((await api.get('/notifications')).status, 401);
  assert.equal((await api.get('/notifications?filter=unknown', { cookie: fixtures.cookies.studentA })).status, 400);
});
