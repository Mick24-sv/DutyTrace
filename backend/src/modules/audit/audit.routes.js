import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import { listAuditEvents, auditStats } from './audit.service.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('admin'));

const VALID_CATEGORIES = ['auth', 'users', 'attendance', 'dtr', 'absences', 'cases', 'qr', 'institution', 'settings'];

const listSchema = z.object({
  search:     z.string().trim().max(200).optional(),
  category:   z.enum(VALID_CATEGORIES).optional(),
  action:     z.string().trim().max(100).optional(),
  actorId:    z.string().uuid().optional(),
  role:       z.enum(['student', 'supervisor', 'admin', 'system']).optional(),
  targetType: z.string().trim().max(60).optional(),
  dateFrom:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  dateTo:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  page:       z.coerce.number().int().min(1).max(10000).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/audit  — paginated event list, admin only, scoped to their institution.
auditRouter.get('/', asyncHandler(async (req, res) => {
  const filters = parse(listSchema, req.query);
  const result = await listAuditEvents({
    institutionId: req.user.institutionId,
    ...filters,
  });
  ok(res, result);
}));

// GET /api/audit/stats  — summary cards for the Audit Trail page.
auditRouter.get('/stats', asyncHandler(async (req, res) => {
  ok(res, await auditStats(req.user.institutionId));
}));

