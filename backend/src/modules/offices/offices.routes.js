import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { recordAudit } from '../audit/audit.service.js';

const createSchema = z.object({
  code: z.string().trim().min(1, 'Code is required.').max(20),
  name: z.string().trim().min(1, 'Name is required.').max(120),
});

const toOffice = (r) => ({ id: r.id, code: r.code, name: r.name, isActive: r.is_active });

export const officesRouter = Router();
officesRouter.use(requireAuth);

// Admin sees every office; a supervisor sees only the office they are assigned to.
// Students have no need to list offices (they get theirs from /auth/me).
officesRouter.get('/', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const { rows } = req.user.role === 'admin'
    ? await query('SELECT id, code, name, is_active FROM offices WHERE institution_id = $1 ORDER BY code', [req.user.institutionId])
    : await query('SELECT id, code, name, is_active FROM offices WHERE id = $1', [req.user.office?.id ?? null]);
  ok(res, { offices: rows.map(toOffice) });
}));

officesRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(createSchema, req.body ?? {});
  const office = await withTransaction(async (db) => {
    const dup = await db.query('SELECT 1 FROM offices WHERE institution_id = $2 AND lower(code) = lower($1)', [input.code, req.user.institutionId]);
    if (dup.rowCount) throw new AppError(409, 'CODE_TAKEN', 'An office with that code already exists.');
    const { rows } = await db.query(
      'INSERT INTO offices (code, name, institution_id) VALUES ($1, $2, $3) RETURNING id, code, name, is_active',
      [input.code, input.name, req.user.institutionId],
    );
    await recordAudit({ actorId: req.user.id, action: 'office.create', targetType: 'office', targetId: rows[0].id, after: toOffice(rows[0]), ip: req.ip }, db);
    return toOffice(rows[0]);
  });
  ok(res, { office }, 201);
}));

// Student assistants currently assigned to an office.
// Admin: any office. Supervisor: only the office they are assigned to.
officesRouter.get('/:id/assistants', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.id);
  if (req.user.role === 'supervisor' && req.user.office?.id !== officeId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  }
  const exists = req.user.role === 'admin'
    ? await query('SELECT 1 FROM offices WHERE id = $1 AND institution_id = $2', [officeId, req.user.institutionId])
    : await query('SELECT 1 FROM offices WHERE id = $1', [officeId]);
  if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Office not found.');

  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.status
     FROM duty_assignments d JOIN users u ON u.id = d.user_id
     WHERE d.office_id = $1 AND d.ends_on IS NULL AND u.role = 'student'
       AND u.institution_id = $2
     ORDER BY u.full_name`,
    [officeId, req.user.institutionId],
  );
  ok(res, { assistants: rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, status: r.status })) });
}));
