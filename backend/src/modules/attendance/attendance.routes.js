import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { USER_WITH_OFFICE_SQL, toPublicUser } from '../auth/auth.service.js';
import * as attendance from './attendance.service.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

// Only these two fields are read from the body. There is deliberately NO userId
// (you can only record your own attendance) and NO timestamp (the server clock decides).
const scanSchema = z.object({
  action: z.enum(['time_in', 'time_out']),
  qrPayload: z.string().min(1, 'Scan or paste a QR code.').max(200),
});

const monthSchema = z
  .string()
  .refine(attendance.isMonth, 'Month must look like 2026-10.')
  .refine((m) => Number(m.slice(0, 4)) >= 2000 && Number(m.slice(0, 4)) <= 2100, 'Month is out of range.')
  .optional();

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
const recorders = requireRole('student', 'supervisor'); // roles that have their own attendance

// Am I timed in? Which office am I assigned to?
attendanceRouter.get('/status', recorders, asyncHandler(async (req, res) => {
  const current = await attendance.getState(req.user.id);
  ok(res, { ...current, office: req.user.office, timezone: env.timezone });
}));

// Record my own time-in / time-out by presenting my office's QR code.
attendanceRouter.post('/scan', recorders, asyncHandler(async (req, res) => {
  const { action, qrPayload } = parse(scanSchema, req.body ?? {});
  const result = await attendance.scan({
    user: req.user, action, qrPayload, ip: req.ip, userAgent: req.get('user-agent'),
  });
  ok(res, result, 201);
}));

// My own daily/monthly history.
attendanceRouter.get('/me', recorders, asyncHandler(async (req, res) => {
  const month = parse(monthSchema, req.query.month);
  ok(res, await attendance.monthHistory(req.user.id, month));
}));

// Someone else's history.
//   admin      : any student or supervisor (read-only)
//   supervisor : only students currently assigned to the supervisor's office
//   student    : never (they use /me)
attendanceRouter.get('/users/:userId', requireRole('supervisor', 'admin'), asyncHandler(async (req, res) => {
  const userId = parseId(req.params.userId);
  const month = parse(monthSchema, req.query.month);

  const { rows } = await query(`${USER_WITH_OFFICE_SQL} WHERE u.id = $1`, [userId]);
  const target = rows[0] && toPublicUser(rows[0]);

  if (req.user.role === 'supervisor') {
    // Unknown id and "not your student" look the same, so ids can't be probed.
    const allowed = target && target.role === 'student' && target.office && target.office.id === req.user.office?.id;
    if (!allowed) throw forbidden();
  } else if (!target || target.role === 'admin') {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }

  ok(res, {
    user: { id: target.id, fullName: target.fullName, email: target.email, role: target.role, office: target.office },
    ...(await attendance.monthHistory(userId, month)),
  });
}));

// Month summary for every student assigned to an office (supervisor: own office only; admin: any).
attendanceRouter.get('/office/:officeId/summary', requireRole('supervisor', 'admin'), asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.officeId);
  const month = parse(monthSchema, req.query.month);
  if (req.user.role === 'supervisor' && req.user.office?.id !== officeId) throw forbidden();

  const office = await query('SELECT id, code, name FROM offices WHERE id = $1', [officeId]);
  if (!office.rowCount) throw new AppError(404, 'NOT_FOUND', 'Office not found.');
  ok(res, { office: office.rows[0], ...(await attendance.officeSummary(officeId, month)) });
}));
