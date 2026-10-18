import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import { recordAudit } from '../audit/audit.service.js';

export const institutionsRouter = Router();
institutionsRouter.use(requireAuth);

institutionsRouter.get('/me', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, timezone, created_at FROM institutions WHERE id = $1',
    [req.user.institutionId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
  ok(res, {
    institution: {
      id: rows[0].id,
      name: rows[0].name,
      timezone: rows[0].timezone,
      createdAt: rows[0].created_at,
    },
  });
}));

institutionsRouter.put('/me', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(1).max(160),
    timezone: z.string().trim().min(1).max(100).refine((value) => {
      try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }, 'Enter a valid IANA timezone.'),
  }), req.body ?? {});

  const institution = await withTransaction(async (db) => {
    const { rows: [before] } = await db.query(
      'SELECT id, name, timezone FROM institutions WHERE id = $1 FOR UPDATE',
      [req.user.institutionId],
    );
    if (!before) throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
    const duplicate = await db.query(
      'SELECT 1 FROM institutions WHERE lower(name) = lower($1) AND id <> $2',
      [input.name, req.user.institutionId],
    );
    if (duplicate.rowCount) throw new AppError(409, 'INSTITUTION_NAME_TAKEN', 'Another institution already uses that name.');
    const { rows: [updated] } = await db.query(
      'UPDATE institutions SET name = $2, timezone = $3 WHERE id = $1 RETURNING id, name, timezone',
      [req.user.institutionId, input.name, input.timezone],
    );
    await recordAudit({
      actorId: req.user.id,
      action: 'institution.update',
      targetType: 'institution',
      targetId: updated.id,
      before: { name: before.name, timezone: before.timezone },
      after: { name: updated.name, timezone: updated.timezone },
      ip: req.ip,
    }, db);
    return updated;
  });
  ok(res, { institution });
}));
