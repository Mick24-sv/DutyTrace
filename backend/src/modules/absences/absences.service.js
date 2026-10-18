import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertCanView, forbidden, isOfficeSupervisor, isOwner } from '../common/access.js';
import {
  acceptUpload, assertRoomForDocument, countDocuments, discardUpload, insertManualReceipt, insertOnlineDocument, listDocuments,
} from '../documents/documents.service.js';
import { ABSENCE_ACCEPTS_DOCUMENTS, canMoveAbsence, validateAbsenceDates } from './absences.rules.js';

const SELECT = `
  SELECT a.id, a.user_id, a.office_id, a.absence_type, to_char(a.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(a.end_date, 'YYYY-MM-DD') AS end_date, a.reason, a.status, a.response, a.responded_at,
         a.submitted_at, a.updated_at, s.full_name AS student_name, s.email AS student_email,
         o.code AS office_code, o.name AS office_name, rb.full_name AS responded_by_name
  FROM absence_notices a
  JOIN users s ON s.id = a.user_id
  JOIN offices o ON o.id = a.office_id
  LEFT JOIN users rb ON rb.id = a.responded_by`;

const mapAbsence = (r) => ({
  id: r.id,
  type: r.absence_type,
  startDate: r.start_date,
  endDate: r.end_date,
  reason: r.reason,
  status: r.status,
  response: r.response,
  respondedBy: r.responded_by_name,
  respondedAt: r.responded_at,
  submittedAt: r.submitted_at,
  updatedAt: r.updated_at,
  student: { id: r.user_id, fullName: r.student_name, email: r.student_email },
  office: { id: r.office_id, code: r.office_code, name: r.office_name },
});

const today = async (db = { query }) =>
  (await db.query(`SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS d`, [env.timezone])).rows[0].d;

const loadRow = async (id, db = { query }, lock = false) =>
  (await db.query(
    `SELECT a.*, u.institution_id FROM absence_notices a JOIN users u ON u.id = a.user_id
     WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`, [id],
  )).rows[0];

const addEvent = (db, { id, action, from, to, actor, note = null }) =>
  db.query(
    `INSERT INTO absence_events (absence_id, action, from_status, to_status, actor_id, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, action, from, to, actor.id, note],
  );

// ----------------------------------------------------------------- submit
export async function create({ user, type, startDate, endDate, reason, ip }) {
  if (!user.office) throw new AppError(403, 'NOT_ASSIGNED', 'You are not assigned to an office. Ask an administrator.');
  const errors = validateAbsenceDates({ type, start: startDate, end: endDate, today: await today() });
  if (Object.keys(errors).length) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', errors);

  return withTransaction(async (db) => {
    // submitted_at is the database clock (column default); the request cannot supply it.
    const { rows } = await db.query(
      `INSERT INTO absence_notices (user_id, office_id, absence_type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, user.office.id, type, startDate, endDate, reason],
    );
    const id = rows[0].id;
    await addEvent(db, { id, action: 'submitted', from: null, to: 'pending', actor: user });
    await recordAudit({
      actorId: user.id, action: 'absence.submitted', targetType: 'absence_notice', targetId: id,
      after: { type, startDate, endDate, officeId: user.office.id }, ip,
    }, db);
    return getDetail({ user, id }, db);
  });
}

// ------------------------------------------------------------------- read
export async function list({ user, status }) {
  const where = []; const params = [];
  if (user.role === 'student') { params.push(user.id); where.push(`a.user_id = $${params.length}`); }
  if (user.role === 'supervisor') {
    if (!user.office) return [];
    params.push(user.office.id); where.push(`a.office_id = $${params.length}`);
    params.push(user.id); where.push(`a.user_id <> $${params.length}`);
  }
  if (user.role === 'admin') {
    if (!user.institutionId) return [];
    params.push(user.institutionId); where.push(`s.institution_id = $${params.length}`);
  }
  if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
  const { rows } = await query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.submitted_at DESC`, params,
  );
  return rows.map(mapAbsence);
}

export async function getDetail({ user, id }, db = { query }) {
  const raw = await loadRow(id, db);
  assertCanView(user, raw);
  const { rows } = await db.query(`${SELECT} WHERE a.id = $1`, [id]);
  const events = await db.query(
    `SELECT e.id, e.action, e.from_status, e.to_status, e.note, e.created_at, u.id AS actor_id, u.full_name AS actor_name, u.role AS actor_role
     FROM absence_events e JOIN users u ON u.id = e.actor_id WHERE e.absence_id = $1 ORDER BY e.id`, [id]);
  const detail = mapAbsence(rows[0]);
  return {
    ...detail,
    timezone: env.timezone,
    documents: await listDocuments('absence_id', id, db),
    history: events.rows.map((e) => ({
      id: Number(e.id), action: e.action, fromStatus: e.from_status, toStatus: e.to_status, note: e.note, at: e.created_at,
      actor: { id: e.actor_id, fullName: e.actor_name, role: e.actor_role },
    })),
    // What THIS viewer may do now (the API enforces it again on every action).
    actions: [
      ...(isOwner(user, raw) && ABSENCE_ACCEPTS_DOCUMENTS.has(raw.status) ? ['upload'] : []),
      ...(isOwner(user, raw) && raw.status === 'needs_follow_up' ? ['respond'] : []),
      ...(isOfficeSupervisor(user, raw) && canMoveAbsence(raw.status, 'acknowledged') ? ['acknowledge'] : []),
      ...(isOfficeSupervisor(user, raw) && canMoveAbsence(raw.status, 'reviewed') ? ['review'] : []),
      ...(isOfficeSupervisor(user, raw) && canMoveAbsence(raw.status, 'needs_follow_up') ? ['follow_up'] : []),
      ...(isOfficeSupervisor(user, raw) ? ['record_receipt'] : []),
    ],
  };
}

// -------------------------------------------------------------- review actions
// Only supervisors of the notice's office. `response` is required when reviewing or asking for follow-up.
async function review({ user, id, to, action, response, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isOfficeSupervisor(user, row)) throw forbidden();
    if (!canMoveAbsence(row.status, to)) {
      throw new AppError(409, 'INVALID_TRANSITION', `A notice that is "${row.status.replace('_', ' ')}" cannot become "${to.replace('_', ' ')}".`);
    }
    await db.query(
      `UPDATE absence_notices SET status = $2, response = COALESCE($3, response),
         responded_by = $4, responded_at = now() WHERE id = $1`,
      [id, to, response ?? null, user.id],
    );
    await addEvent(db, { id, action, from: row.status, to, actor: user, note: response ?? null });
    await recordAudit({
      actorId: user.id, action: `absence.${action}`, targetType: 'absence_notice', targetId: id,
      before: { status: row.status }, after: { status: to }, ip,
    }, db);
    return getDetail({ user, id }, db);
  });
}

export const acknowledge = ({ user, id, response, ip }) => review({ user, id, to: 'acknowledged', action: 'acknowledged', response, ip });
export const markReviewed = ({ user, id, response, ip }) => review({ user, id, to: 'reviewed', action: 'reviewed', response, ip });
export const requestFollowUp = ({ user, id, response, ip }) => review({ user, id, to: 'needs_follow_up', action: 'follow_up_requested', response, ip });

// The student answers a follow-up request; the notice goes back to "pending" for the supervisor.
export async function respond({ user, id, message, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isOwner(user, row)) throw forbidden();
    if (!canMoveAbsence(row.status, 'pending') || row.status !== 'needs_follow_up') {
      throw new AppError(409, 'INVALID_TRANSITION', 'There is no follow-up request to answer.');
    }
    await db.query(`UPDATE absence_notices SET status = 'pending' WHERE id = $1`, [id]);
    await addEvent(db, { id, action: 'student_responded', from: row.status, to: 'pending', actor: user, note: message });
    await recordAudit({ actorId: user.id, action: 'absence.student_responded', targetType: 'absence_notice', targetId: id, ip }, db);
    return getDetail({ user, id }, db);
  });
}

// -------------------------------------------------------------- documents
export async function addDocument({ user, id, buffer, rawName, ip }) {
  // Cheap checks first so a refused request never writes a file.
  const pre = await loadRow(id);
  assertCanView(user, pre);
  if (!isOwner(user, pre)) throw forbidden();

  const accepted = await acceptUpload(buffer, rawName);
  try {
    return await withTransaction(async (db) => {
      const row = await loadRow(id, db, true);
      if (!ABSENCE_ACCEPTS_DOCUMENTS.has(row.status)) {
        throw new AppError(409, 'NOT_ACCEPTING_DOCUMENTS', 'This notice has been reviewed, so no more documents can be added.');
      }
      assertRoomForDocument(await countDocuments(db, 'absence_id', id));
      const docId = await insertOnlineDocument(db, { owner: user, absenceId: id, accepted });
      await addEvent(db, { id, action: 'document_added', from: row.status, to: row.status, actor: user, note: `Uploaded ${accepted.originalName}` });
      await recordAudit({
        actorId: user.id, action: 'document.uploaded', targetType: 'document', targetId: docId,
        after: { absenceId: id, mime: accepted.mime, sizeBytes: accepted.size, method: 'online' }, ip,
      }, db);
      return getDetail({ user, id }, db);
    });
  } catch (err) {
    await discardUpload(accepted);
    throw err;
  }
}

// A supervisor records something that arrived by email or in person.
export async function recordReceipt({ user, id, method, receivedDate, receivedById, notes, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isOfficeSupervisor(user, row)) throw forbidden();
    const nowDay = await today(db);
    if (receivedDate > nowDay) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', { receivedDate: 'The received date cannot be in the future.' });
    const receiver = await validateReceiver(db, receivedById ?? user.id, user.institutionId);
    assertRoomForDocument(await countDocuments(db, 'absence_id', id));
    const docId = await insertManualReceipt(db, {
      ownerId: row.user_id, absenceId: id, method, receivedDate, receivedBy: receiver.id, notes, actor: user,
    });
    await addEvent(db, {
      id, action: 'document_added', from: row.status, to: row.status, actor: user,
      note: `Recorded ${method === 'email' ? 'email' : 'in-person'} submission received ${receivedDate} by ${receiver.full_name}`,
    });
    await recordAudit({
      actorId: user.id, action: 'document.receipt_recorded', targetType: 'document', targetId: docId,
      after: { absenceId: id, method, receivedDate, receivedBy: receiver.id }, ip,
    }, db);
    return getDetail({ user, id }, db);
  });
}

// "Receiving staff member" must be an active supervisor or administrator.
export async function validateReceiver(db, userId, institutionId) {
  const { rows } = await db.query(
    `SELECT id, full_name FROM users
     WHERE id = $1 AND institution_id = $2 AND status = 'active' AND role IN ('supervisor', 'admin')`,
    [userId, institutionId]);
  if (!rows[0]) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', { receivedById: 'Choose an active supervisor or administrator.' });
  return rows[0];
}

// ---------------------------------------------------------------- summary
export async function summary(user) {
  let where = '';
  const params = [];
  if (user.role === 'student') {
    where = 'WHERE user_id = $1';
    params.push(user.id);
  } else if (user.role === 'supervisor') {
    if (!user.office) return { pending: 0, acknowledged: 0, reviewed: 0, needsFollowUp: 0 };
    where = 'WHERE office_id = $1 AND user_id <> $2';
    params.push(user.office.id, user.id);
  } else if (user.role === 'admin') {
    if (!user.institutionId) return { pending: 0, acknowledged: 0, reviewed: 0, needsFollowUp: 0 };
    where = 'WHERE u.institution_id = $1';
    params.push(user.institutionId);
  }
  const { rows } = await query(
    `SELECT a.status, count(*)::int AS n FROM absence_notices a
     JOIN users u ON u.id = a.user_id ${where} GROUP BY a.status`, params,
  );
  const n = (s) => rows.find((r) => r.status === s)?.n ?? 0;
  return { pending: n('pending'), acknowledged: n('acknowledged'), reviewed: n('reviewed'), needsFollowUp: n('needs_follow_up') };
}
