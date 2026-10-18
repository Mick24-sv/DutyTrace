import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertCanView, forbidden, isOfficeSupervisor, isOwner } from '../common/access.js';
import {
  acceptUpload, assertRoomForDocument, countDocuments, discardUpload, insertManualReceipt, insertOnlineDocument, listDocuments,
} from '../documents/documents.service.js';
import { validateReceiver } from '../absences/absences.service.js';
import {
  REQUIREMENTS_EDITABLE, STUDENT_CAN_UPLOAD, canMoveCase, caseReference, missingRequirements, validateCasePeriod,
} from './cases.rules.js';

const validation = (details) => new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', details);
const today = async (db = { query }) =>
  (await db.query(`SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS d`, [env.timezone])).rows[0].d;

// ------------------------------------------------------------- case types
const mapType = (r) => ({
  id: r.id, code: r.code, name: r.name, description: r.description,
  requiredDocuments: r.required_documents, isActive: r.is_active,
});

export async function listTypes(institutionId) {
  const { rows } = await query(
    'SELECT * FROM case_types WHERE institution_id = $1 ORDER BY is_active DESC, name', [institutionId],
  );
  return rows.map(mapType);
}

export async function createType({ actor, code, name, description, requiredDocuments, ip }) {
  try {
    return await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO case_types (institution_id, code, name, description, required_documents, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [actor.institutionId, code, name, description ?? null, JSON.stringify(requiredDocuments), actor.id],
      );
      await recordAudit({ actorId: actor.id, action: 'case_type.created', targetType: 'case_type', targetId: rows[0].id, after: { code, name }, ip }, db);
      return mapType(rows[0]);
    });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'CODE_TAKEN', 'A case type with that code already exists.', { code: 'Already in use.' });
    throw err;
  }
}

export async function updateType({ actor, id, patch, ip }) {
  return withTransaction(async (db) => {
    const { rows: found } = await db.query(
      'SELECT * FROM case_types WHERE id = $1 AND institution_id = $2 FOR UPDATE', [id, actor.institutionId],
    );
    if (!found[0]) throw new AppError(404, 'NOT_FOUND', 'Case type not found.');
    const next = {
      name: patch.name ?? found[0].name,
      description: patch.description === undefined ? found[0].description : patch.description,
      required_documents: patch.requiredDocuments ?? found[0].required_documents,
      is_active: patch.isActive ?? found[0].is_active,
    };
    const { rows } = await db.query(
      `UPDATE case_types SET name = $2, description = $3, required_documents = $4, is_active = $5 WHERE id = $1 RETURNING *`,
      [id, next.name, next.description, JSON.stringify(next.required_documents), next.is_active],
    );
    await recordAudit({
      actorId: actor.id, action: 'case_type.updated', targetType: 'case_type', targetId: id,
      before: mapType(found[0]), after: mapType(rows[0]), ip,
    }, db);
    return mapType(rows[0]);
  });
}

// ------------------------------------------------------------------ mapping
const SELECT = `
  SELECT c.id, c.reference, c.user_id, c.office_id, c.case_type_id, c.description,
         to_char(c.period_start, 'YYYY-MM-DD') AS period_start, to_char(c.period_end, 'YYYY-MM-DD') AS period_end,
         c.status, c.decision, to_char(c.resolution_date, 'YYYY-MM-DD') AS resolution_date,
         c.resolved_at, c.closed_at, c.created_at, c.updated_at,
         s.full_name AS student_name, s.email AS student_email, o.code AS office_code, o.name AS office_name,
         t.name AS type_name, t.code AS type_code, cb.full_name AS created_by_name, rb.full_name AS resolved_by_name,
         (SELECT count(*)::int FROM case_requirements r
            WHERE r.case_id = c.id AND r.is_required AND r.waived_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.requirement_id = r.id)) AS missing_count
  FROM compliance_cases c
  JOIN users s ON s.id = c.user_id
  JOIN offices o ON o.id = c.office_id
  JOIN case_types t ON t.id = c.case_type_id
  JOIN users cb ON cb.id = c.created_by
  LEFT JOIN users rb ON rb.id = c.resolved_by`;

const mapCase = (r) => ({
  id: r.id,
  reference: r.reference,
  type: { id: r.case_type_id, code: r.type_code, name: r.type_name },
  description: r.description,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  status: r.status,
  // The decision is only shown once the case has been decided.
  decision: r.status === 'resolved' || r.status === 'closed' ? r.decision : null,
  resolutionDate: r.status === 'resolved' || r.status === 'closed' ? r.resolution_date : null,
  resolvedBy: r.resolved_by_name,
  resolvedAt: r.resolved_at,
  closedAt: r.closed_at,
  createdBy: r.created_by_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  missingRequirements: r.missing_count,
  student: { id: r.user_id, fullName: r.student_name, email: r.student_email },
  office: { id: r.office_id, code: r.office_code, name: r.office_name },
});

const loadRow = async (id, db = { query }, lock = false) =>
  (await db.query(
    `SELECT c.*, u.institution_id FROM compliance_cases c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`, [id],
  )).rows[0];

async function loadRequirements(db, caseId) {
  const { rows } = await db.query(
    `SELECT r.id, r.label, r.is_required, r.waived_at, r.waived_reason, wb.full_name AS waived_by_name,
            (SELECT count(*)::int FROM documents d WHERE d.requirement_id = r.id) AS doc_count
     FROM case_requirements r LEFT JOIN users wb ON wb.id = r.waived_by
     WHERE r.case_id = $1 ORDER BY r.created_at, r.label`, [caseId]);
  return rows.map((r) => ({
    id: r.id, label: r.label, isRequired: r.is_required, waived: Boolean(r.waived_at),
    waivedReason: r.waived_reason, waivedBy: r.waived_by_name, docCount: r.doc_count,
    satisfied: Boolean(r.waived_at) || r.doc_count > 0,
  }));
}

const addEvent = (db, { id, action, from = null, to = null, actor, note = null, requirementId = null }) =>
  db.query(
    `INSERT INTO case_events (case_id, action, from_status, to_status, actor_id, note, requirement_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, action, from, to, actor.id, note, requirementId],
  );

const audit = (db, user, action, id, extra = {}, ip) =>
  recordAudit({ actorId: user.id, action: `case.${action}`, targetType: 'compliance_case', targetId: id, ...extra, ip }, db);

// Staff = administrators (everything) and supervisors of the case's office (view, notes, receipts only).
const isAdmin = (user) => user.role === 'admin';

function actionsFor(user, row, reqs) {
  const status = row.status;
  const out = [];
  if (isOwner(user, row)) {
    if (STUDENT_CAN_UPLOAD.has(status)) out.push('upload');
    if (status === 'open' || status === 'documents_pending') out.push('submit');
    if (status === 'needs_correction') out.push('respond');
  }
  if (isAdmin(user)) {
    if (status === 'open' || status === 'documents_pending') out.push('start_review');
    if (status === 'under_review') out.push('request_correction', 'resolve');
    if (status === 'resolved') out.push('reopen');
    if (status !== 'closed') out.push('close', 'add_note', 'record_receipt');
    if (REQUIREMENTS_EDITABLE.has(status)) out.push('add_requirement', ...(reqs.some((r) => !r.waived && !r.satisfied) ? ['waive'] : []));
  } else if (isOfficeSupervisor(user, row) && status !== 'closed') {
    out.push('add_note', 'record_receipt');
  }
  return out;
}

// --------------------------------------------------------------------- create
export async function createCase({ actor, userId, caseTypeId, description, periodStart, periodEnd, extraRequirements = [], ip }) {
  const errors = validateCasePeriod(periodStart, periodEnd);
  if (Object.keys(errors).length) throw validation(errors);

  return withTransaction(async (db) => {
    const { rows: stu } = await db.query(
      `SELECT u.id, u.full_name, d.office_id FROM users u
       LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
       WHERE u.id = $1 AND u.institution_id = $2 AND u.role = 'student' AND u.status = 'active'`,
      [userId, actor.institutionId]);
    if (!stu[0]) throw validation({ userId: 'Choose an active Student Assistant.' });
    if (!stu[0].office_id) throw validation({ userId: 'That student is not assigned to an office yet.' });
    const { rows: types } = await db.query(
      'SELECT * FROM case_types WHERE id = $1 AND institution_id = $2', [caseTypeId, actor.institutionId],
    );
    if (!types[0] || !types[0].is_active) throw validation({ caseTypeId: 'Choose an active case type.' });

    const { rows: ref } = await db.query(
      `SELECT to_char(now() AT TIME ZONE $1, 'YYYY') AS year, nextval('case_reference_seq')::int AS seq`, [env.timezone]);
    const reference = caseReference(ref[0].year, ref[0].seq);

    const labels = [...types[0].required_documents, ...extraRequirements];
    const status = labels.length ? 'documents_pending' : 'open';
    const { rows } = await db.query(
      `INSERT INTO compliance_cases (reference, user_id, office_id, case_type_id, description, period_start, period_end, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [reference, userId, stu[0].office_id, caseTypeId, description, periodStart, periodEnd, status, actor.id],
    );
    const id = rows[0].id;
    for (const label of labels) {
      await db.query('INSERT INTO case_requirements (case_id, label, created_by) VALUES ($1, $2, $3)', [id, label, actor.id]);
    }
    await addEvent(db, { id, action: 'created', to: status, actor, note: `Case ${reference} opened (${types[0].name})` });
    await audit(db, actor, 'created', id, { after: { reference, userId, caseTypeId, periodStart, periodEnd, requirements: labels.length } }, ip);
    return getDetail({ user: actor, id }, db);
  });
}

// ----------------------------------------------------------------------- read
export async function list({ user, status, userId }) {
  const where = []; const params = [];
  if (user.role === 'student') { params.push(user.id); where.push(`c.user_id = $${params.length}`); }
  if (user.role === 'supervisor') {
    if (!user.office) return [];
    params.push(user.office.id); where.push(`c.office_id = $${params.length}`);
    params.push(user.id); where.push(`c.user_id <> $${params.length}`);
  }
  if (user.role === 'admin') {
    if (!user.institutionId) return [];
    params.push(user.institutionId); where.push(`s.institution_id = $${params.length}`);
  }
  if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (userId && user.role !== 'student') { params.push(userId); where.push(`c.user_id = $${params.length}`); }
  const { rows } = await query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at DESC`, params,
  );
  return rows.map(mapCase);
}

export async function getDetail({ user, id }, db = { query }) {
  const raw = await loadRow(id, db);
  assertCanView(user, raw);
  const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [id]);
  const reqs = await loadRequirements(db, id);
  const events = await db.query(
    `SELECT e.id, e.action, e.from_status, e.to_status, e.note, e.requirement_id, e.created_at,
            u.id AS actor_id, u.full_name AS actor_name, u.role AS actor_role
     FROM case_events e JOIN users u ON u.id = e.actor_id WHERE e.case_id = $1 ORDER BY e.id`, [id]);
  return {
    ...mapCase(rows[0]),
    timezone: env.timezone,
    requirements: reqs.map((r) => ({ ...r })),
    documents: await listDocuments('case_id', id, db),
    history: events.rows.map((e) => ({
      id: Number(e.id), action: e.action, fromStatus: e.from_status, toStatus: e.to_status, note: e.note,
      requirementId: e.requirement_id, at: e.created_at, actor: { id: e.actor_id, fullName: e.actor_name, role: e.actor_role },
    })),
    actions: actionsFor(user, raw, reqs),
  };
}

// ------------------------------------------------------------------- workflow
async function requireSatisfied(db, id) {
  const missing = missingRequirements(await loadRequirements(db, id));
  if (missing.length) {
    throw new AppError(409, 'DOCUMENTS_MISSING', `These required documents are still missing: ${missing.join(', ')}.`, { missing });
  }
}

// Locks the case, checks the actor and the move, applies it, writes history + audit.
async function move({ user, id, to, action, ip, note = null, who, check, extra = {} }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!who(user, row)) throw forbidden();
    if (!canMoveCase(row.status, to)) {
      throw new AppError(409, 'INVALID_TRANSITION', `A case that is "${row.status.replace('_', ' ')}" cannot become "${to.replace('_', ' ')}".`);
    }
    await check?.(db, row);
    const sets = ['status = $2']; const params = [id, to];
    for (const [col, val] of Object.entries(extra)) { params.push(val); sets.push(`${col} = $${params.length}`); }
    await db.query(`UPDATE compliance_cases SET ${sets.join(', ')} WHERE id = $1`, params);
    await addEvent(db, { id, action, from: row.status, to, actor: user, note });
    await audit(db, user, action, id, { before: { status: row.status }, after: { status: to, ...(note ? { note } : {}) } }, ip);
    return getDetail({ user, id }, db);
  });
}

const ownerOnly = (user, row) => isOwner(user, row);
const adminOnly = (user) => isAdmin(user);

export const submit = ({ user, id, message, ip }) => move({
  user, id, to: 'under_review', action: 'submitted_for_review', ip, note: message ?? null, who: ownerOnly,
  check: async (db, row) => {
    if (row.status === 'needs_correction') throw new AppError(409, 'INVALID_TRANSITION', 'Answer the correction request instead (respond).');
    // Only a case that is still collecting documents can be submitted. (The state machine also lets an
    // administrator move resolved -> under_review, which a student must never be able to trigger.)
    if (row.status !== 'open' && row.status !== 'documents_pending') {
      throw new AppError(409, 'INVALID_TRANSITION', `A case that is "${row.status.replace('_', ' ')}" cannot be submitted.`);
    }
    await requireSatisfied(db, id);
  },
});

export const respond = ({ user, id, message, ip }) => move({
  user, id, to: 'under_review', action: 'student_responded', ip, note: message, who: ownerOnly,
  check: async (db, row) => {
    if (row.status !== 'needs_correction') throw new AppError(409, 'INVALID_TRANSITION', 'There is no correction request to answer.');
    await requireSatisfied(db, id);
  },
});

// Starting a review is for cases that have not been reviewed yet. A returned case goes back to review
// only when the student answers (respond), never by staff skipping that step.
export const startReview = ({ user, id, ip }) => move({
  user, id, to: 'under_review', action: 'review_started', ip, who: adminOnly,
  check: async (db, row) => {
    if (row.status !== 'open' && row.status !== 'documents_pending') {
      throw new AppError(409, 'INVALID_TRANSITION', `A case that is "${row.status.replace('_', ' ')}" cannot start review.`);
    }
    await requireSatisfied(db, id);
  },
});

export const requestCorrection = ({ user, id, note, ip }) => move({
  user, id, to: 'needs_correction', action: 'correction_requested', ip, note, who: adminOnly,
});

export const resolve = async ({ user, id, decision, resolutionDate, ip }) => {
  const nowDay = await today();
  const date = resolutionDate ?? nowDay;
  if (date > nowDay) throw validation({ resolutionDate: 'The resolution date cannot be in the future.' });
  return move({
    user, id, to: 'resolved', action: 'resolved', ip, note: decision, who: adminOnly,
    extra: { decision, resolution_date: date, resolved_by: user.id, resolved_at: new Date() },
  });
};

export const reopen = ({ user, id, reason, ip }) => move({
  user, id, to: 'under_review', action: 'reopened', ip, note: reason, who: adminOnly,
  check: async (_db, row) => {
    if (row.status !== 'resolved') throw new AppError(409, 'INVALID_TRANSITION', 'Only a resolved case can be reopened.');
  },
});

export const close = ({ user, id, note, ip }) => move({
  user, id, to: 'closed', action: 'closed', ip, note, who: adminOnly, extra: { closed_by: user.id, closed_at: new Date() },
});

// ---------------------------------------------------- requirements and notes
export async function addRequirement({ user, id, label, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isAdmin(user)) throw forbidden();
    if (!REQUIREMENTS_EDITABLE.has(row.status)) throw new AppError(409, 'CASE_LOCKED', 'Requirements can no longer be added to this case.');
    const { rows } = await db.query('INSERT INTO case_requirements (case_id, label, created_by) VALUES ($1, $2, $3) RETURNING id', [id, label, user.id]);
    // Asking for something new means the student has something to provide again.
    const to = row.status === 'open' || row.status === 'under_review' ? 'documents_pending' : null;
    if (to) await db.query(`UPDATE compliance_cases SET status = $2 WHERE id = $1`, [id, to]);
    await addEvent(db, { id, action: 'requirement_added', from: row.status, to: to ?? row.status, actor: user, note: label, requirementId: rows[0].id });
    await audit(db, user, 'requirement_added', id, { after: { label } }, ip);
    return getDetail({ user, id }, db);
  });
}

export async function waiveRequirement({ user, id, requirementId, reason, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isAdmin(user)) throw forbidden();
    if (!REQUIREMENTS_EDITABLE.has(row.status)) throw new AppError(409, 'CASE_LOCKED', 'Requirements can no longer be changed on this case.');
    const { rows } = await db.query('SELECT id, label, waived_at FROM case_requirements WHERE id = $1 AND case_id = $2 FOR UPDATE', [requirementId, id]);
    if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Requirement not found on this case.');
    if (rows[0].waived_at) throw new AppError(409, 'ALREADY_WAIVED', 'This requirement was already waived.');
    await db.query('UPDATE case_requirements SET waived_at = now(), waived_by = $2, waived_reason = $3 WHERE id = $1', [requirementId, user.id, reason]);
    await addEvent(db, { id, action: 'requirement_waived', from: row.status, to: row.status, actor: user, note: `${rows[0].label}: ${reason}`, requirementId });
    await audit(db, user, 'requirement_waived', id, { after: { label: rows[0].label, reason } }, ip);
    return getDetail({ user, id }, db);
  });
}

export async function addNote({ user, id, note, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isAdmin(user) && !isOfficeSupervisor(user, row)) throw forbidden();
    if (row.status === 'closed') throw new AppError(409, 'CASE_LOCKED', 'This case is closed.');
    await addEvent(db, { id, action: 'note_added', from: row.status, to: row.status, actor: user, note });
    await audit(db, user, 'note_added', id, {}, ip);
    return getDetail({ user, id }, db);
  });
}

// -------------------------------------------------------------------- documents
async function checkRequirement(db, caseId, requirementId) {
  if (!requirementId) return null;
  const { rows } = await db.query('SELECT id FROM case_requirements WHERE id = $1 AND case_id = $2', [requirementId, caseId]);
  if (!rows[0]) throw validation({ requirementId: 'That requirement does not belong to this case.' });
  return requirementId;
}

export async function addDocument({ user, id, requirementId, buffer, rawName, ip }) {
  const pre = await loadRow(id);
  assertCanView(user, pre);
  if (!isOwner(user, pre)) throw forbidden();

  const accepted = await acceptUpload(buffer, rawName);
  try {
    return await withTransaction(async (db) => {
      const row = await loadRow(id, db, true);
      if (!STUDENT_CAN_UPLOAD.has(row.status)) {
        throw new AppError(409, 'NOT_ACCEPTING_DOCUMENTS', 'Documents can only be added while the case is open, waiting for documents, or returned for correction.');
      }
      await checkRequirement(db, id, requirementId);
      assertRoomForDocument(await countDocuments(db, 'case_id', id));
      const docId = await insertOnlineDocument(db, { owner: user, caseId: id, requirementId, accepted });
      await addEvent(db, { id, action: 'document_added', from: row.status, to: row.status, actor: user, note: `Uploaded ${accepted.originalName}`, requirementId });
      await recordAudit({
        actorId: user.id, action: 'document.uploaded', targetType: 'document', targetId: docId,
        after: { caseId: id, requirementId, mime: accepted.mime, sizeBytes: accepted.size, method: 'online' }, ip,
      }, db);
      return getDetail({ user, id }, db);
    });
  } catch (err) {
    await discardUpload(accepted);
    throw err;
  }
}

// Staff record something that arrived by email or in person (administrators, or the office's supervisor).
export async function recordReceipt({ user, id, method, receivedDate, receivedById, notes, requirementId, ip }) {
  return withTransaction(async (db) => {
    const row = await loadRow(id, db, true);
    assertCanView(user, row);
    if (!isAdmin(user) && !isOfficeSupervisor(user, row)) throw forbidden();
    if (row.status === 'closed') throw new AppError(409, 'CASE_LOCKED', 'This case is closed.');
    if (receivedDate > (await today(db))) throw validation({ receivedDate: 'The received date cannot be in the future.' });
    const receiver = await validateReceiver(db, receivedById ?? user.id, user.institutionId);
    await checkRequirement(db, id, requirementId);
    assertRoomForDocument(await countDocuments(db, 'case_id', id));
    const docId = await insertManualReceipt(db, {
      ownerId: row.user_id, caseId: id, requirementId, method, receivedDate, receivedBy: receiver.id, notes, actor: user,
    });
    await addEvent(db, {
      id, action: 'receipt_recorded', from: row.status, to: row.status, actor: user, requirementId,
      note: `${method === 'email' ? 'Email' : 'In-person'} submission received ${receivedDate} by ${receiver.full_name}${notes ? `: ${notes}` : ''}`,
    });
    await recordAudit({
      actorId: user.id, action: 'document.receipt_recorded', targetType: 'document', targetId: docId,
      after: { caseId: id, method, receivedDate, receivedBy: receiver.id, requirementId }, ip,
    }, db);
    return getDetail({ user, id }, db);
  });
}

// -------------------------------------------------------------------- summary
export async function summary(user) {
  const where = []; const params = [];
  if (user.role === 'student') { params.push(user.id); where.push('c.user_id = $1'); }
  if (user.role === 'supervisor') {
    if (!user.office) return {};
    params.push(user.office.id, user.id); where.push('c.office_id = $1 AND c.user_id <> $2');
  }
  if (user.role === 'admin') {
    if (!user.institutionId) return {};
    params.push(user.institutionId); where.push('u.institution_id = $1');
  }
  const { rows } = await query(
    `SELECT c.status, count(*)::int AS n FROM compliance_cases c
     JOIN users u ON u.id = c.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY c.status`, params);
  const n = (s) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    open: n('open'), documentsPending: n('documents_pending'), underReview: n('under_review'),
    needsCorrection: n('needs_correction'), resolved: n('resolved'), closed: n('closed'),
  };
}
