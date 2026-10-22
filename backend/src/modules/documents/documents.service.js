import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { assertCanView } from '../common/access.js';
import { validateUpload } from './files.js';
import { openFile, putFile, removeFile } from './storage.js';

// ---- shape returned to clients. NEVER includes stored_name, sha256 or any path/URL to the file:
// the only way to get the bytes is GET /api/documents/:id/download, which checks access every time.
export const DOC_SELECT = `
  SELECT d.id, d.method, d.original_name, d.mime_type, d.size_bytes, (d.stored_name IS NOT NULL) AS has_file,
         d.requirement_id, to_char(d.received_date, 'YYYY-MM-DD') AS received_date, d.receipt_notes, d.created_at,
         ub.full_name AS uploaded_by_name, rb.id AS received_by_id, rb.full_name AS received_by_name
  FROM documents d
  JOIN users ub ON ub.id = d.uploaded_by
  LEFT JOIN users rb ON rb.id = d.received_by`;

export const mapDocument = (r) => ({
  id: r.id,
  method: r.method,
  fileName: r.has_file ? r.original_name : null,
  mimeType: r.has_file ? r.mime_type : null,
  sizeBytes: r.has_file ? r.size_bytes : null,
  hasFile: r.has_file,
  requirementId: r.requirement_id,
  receivedDate: r.received_date,
  receivedBy: r.received_by_id ? { id: r.received_by_id, fullName: r.received_by_name } : null,
  notes: r.receipt_notes,
  submittedBy: r.uploaded_by_name,
  submittedAt: r.created_at,
});

export const listDocuments = async (column, id, db = { query }) => {
  const { rows } = await db.query(`${DOC_SELECT} WHERE d.${column} = $1 ORDER BY d.created_at, d.id`, [id]);
  return rows.map(mapDocument);
};

export const countDocuments = async (db, column, id) =>
  (await db.query(`SELECT count(*)::int AS n FROM documents WHERE ${column} = $1`, [id])).rows[0].n;

// Validates the upload and writes the file to private storage. The caller inserts the database row
// and MUST call discardUpload(stored) if that insert (or anything after it) fails.
export async function acceptUpload(buffer, rawName) {
  const meta = validateUpload(buffer, rawName, env.maxUploadBytes);
  const stored = await putFile(buffer);
  return { ...meta, ...stored };
}
export const discardUpload = (accepted) => (accepted ? removeFile(accepted.storedName) : undefined);

export function assertRoomForDocument(count) {
  if (count >= env.maxDocsPerRecord) {
    throw new AppError(409, 'TOO_MANY_DOCUMENTS', `At most ${env.maxDocsPerRecord} documents can be attached to one record.`);
  }
}

export async function insertOnlineDocument(db, { owner, absenceId = null, caseId = null, requirementId = null, accepted }) {
  const { rows } = await db.query(
    `INSERT INTO documents (owner_id, absence_id, case_id, requirement_id, method, original_name, stored_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES ($1, $2, $3, $4, 'online', $5, $6, $7, $8, $9, $1) RETURNING id`,
    [owner.id, absenceId, caseId, requirementId, accepted.originalName, accepted.storedName, accepted.mime, accepted.size, accepted.sha256],
  );
  return rows[0].id;
}

export async function insertManualReceipt(db, { ownerId, absenceId = null, caseId = null, requirementId = null, method, receivedDate, receivedBy, notes, actor }) {
  const { rows } = await db.query(
    `INSERT INTO documents (owner_id, absence_id, case_id, requirement_id, method, received_date, received_by, receipt_notes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ownerId, absenceId, caseId, requirementId, method, receivedDate, receivedBy, notes ?? null, actor.id],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------- download
// Everything about who may read a file is decided HERE, on every request:
//   student: only their own   supervisor: only their office's records   admin: any
export async function openForDownload({ user, id, ip }) {
  const { rows } = await query(
    `SELECT d.id, d.owner_id AS user_id, owner.institution_id, d.stored_name, d.original_name, d.mime_type, d.size_bytes,
            COALESCE(a.office_id, c.office_id) AS office_id
     FROM documents d
     JOIN users owner ON owner.id = d.owner_id
     LEFT JOIN absence_notices a ON a.id = d.absence_id
     LEFT JOIN compliance_cases c ON c.id = d.case_id
     WHERE d.id = $1`,
    [id],
  );
  const doc = rows[0];
  assertCanView(user, doc);
  if (!doc.stored_name) {
    throw new AppError(404, 'NO_FILE', 'This submission was recorded by staff and has no file attached.');
  }
  let stream;
  try {
    stream = await openFile(doc.stored_name);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError(404, 'FILE_MISSING', 'The stored file could not be found. Contact an administrator.');
    }
    throw error;
  }
  await recordAudit({
    actorId: user.id, action: 'document.downloaded', targetType: 'document', targetId: doc.id,
    after: { ownerId: doc.user_id }, ip,
  });
  return { stream, name: doc.original_name, mime: doc.mime_type, size: doc.size_bytes };
}
