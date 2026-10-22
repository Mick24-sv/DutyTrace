import { Router } from 'express';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parseId } from '../../utils/validate.js';
import { recordAudit } from '../audit/audit.service.js';
import { buildPayload } from './qr.service.js';

// Admin-only management of an office's QR code. Mounted at /api/offices/:officeId/qr
export const qrRouter = Router({ mergeParams: true });
qrRouter.use(requireAuth, requireRole('admin'));

// Supervisors may display or print the active code for their assigned office,
// but cannot generate, replace, or revoke it.
export const supervisorQrRouter = Router();
supervisorQrRouter.use(requireAuth, requireRole('supervisor'));

const toCode = (r, { withPayload = false } = {}) => ({
  id: r.id,
  createdAt: r.created_at,
  revokedAt: r.revoked_at,
  active: r.revoked_at === null,
  ...(withPayload ? { payload: buildPayload(r.id) } : {}),
});

async function view(officeId, institutionId, db = { query }) {
  const office = await db.query(
    'SELECT id, code, name FROM offices WHERE id = $1 AND institution_id = $2', [officeId, institutionId],
  );
  if (!office.rowCount) throw new AppError(404, 'NOT_FOUND', 'Office not found.');
  const { rows } = await db.query(
    `SELECT id, created_at, revoked_at FROM office_qr_codes
     WHERE office_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [officeId],
  );
  const active = rows.find((r) => r.revoked_at === null);
  return {
    office: office.rows[0],
    active: active ? toCode(active, { withPayload: true }) : null,
    history: rows.filter((r) => r !== active).map((r) => toCode(r)),
  };
}

// Lock the office row so two admins can't create two active codes at once.
const lockOffice = async (db, officeId, institutionId) => {
  const { rowCount } = await db.query(
    'SELECT 1 FROM offices WHERE id = $1 AND institution_id = $2 FOR UPDATE', [officeId, institutionId],
  );
  if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Office not found.');
};

const revokeActive = async (db, officeId, adminId) => {
  const { rows } = await db.query(
    `UPDATE office_qr_codes SET revoked_at = now(), revoked_by = $2
     WHERE office_id = $1 AND revoked_at IS NULL RETURNING id`,
    [officeId, adminId],
  );
  return rows[0]?.id ?? null;
};

const issue = async (db, officeId, adminId) => {
  const { rows } = await db.query(
    'INSERT INTO office_qr_codes (office_id, created_by) VALUES ($1, $2) RETURNING id',
    [officeId, adminId],
  );
  return rows[0].id;
};

qrRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, await view(parseId(req.params.officeId), req.user.institutionId));
}));

supervisorQrRouter.get('/', asyncHandler(async (req, res) => {
  const officeId = req.user.office?.id;
  if (!officeId) throw new AppError(409, 'OFFICE_NOT_ASSIGNED', 'You are not assigned to an office. Ask an administrator for help.');
  const officeQr = await view(officeId, req.user.institutionId);
  ok(res, { office: officeQr.office, active: officeQr.active });
}));

// Generate the first code. Refuses if a valid one already exists (use regenerate).
qrRouter.post('/', asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.officeId);
  const result = await withTransaction(async (db) => {
    await lockOffice(db, officeId, req.user.institutionId);
    const existing = await db.query('SELECT 1 FROM office_qr_codes WHERE office_id = $1 AND revoked_at IS NULL', [officeId]);
    if (existing.rowCount) throw new AppError(409, 'QR_EXISTS', 'This office already has an active QR code. Use regenerate to replace it.');
    const id = await issue(db, officeId, req.user.id);
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'qr.generate', targetType: 'office', targetId: officeId, after: { qrCodeId: id }, ip: req.ip }, db);
    return view(officeId, req.user.institutionId, db);
  });
  ok(res, result, 201);
}));

// Replace the active code: the old one stops working immediately.
qrRouter.post('/regenerate', asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.officeId);
  const result = await withTransaction(async (db) => {
    await lockOffice(db, officeId, req.user.institutionId);
    const oldId = await revokeActive(db, officeId, req.user.id);
    const newId = await issue(db, officeId, req.user.id);
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'qr.regenerate', targetType: 'office', targetId: officeId, before: { qrCodeId: oldId }, after: { qrCodeId: newId }, ip: req.ip }, db);
    return view(officeId, req.user.institutionId, db);
  });
  ok(res, result);
}));

// Revoke without replacement: nobody can record attendance at this office until a new code is generated.
qrRouter.post('/revoke', asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.officeId);
  const result = await withTransaction(async (db) => {
    await lockOffice(db, officeId, req.user.institutionId);
    const oldId = await revokeActive(db, officeId, req.user.id);
    if (!oldId) throw new AppError(409, 'NO_ACTIVE_QR', 'This office has no active QR code.');
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'qr.revoke', targetType: 'office', targetId: officeId, before: { qrCodeId: oldId }, ip: req.ip }, db);
    return view(officeId, req.user.institutionId, db);
  });
  ok(res, result);
}));
