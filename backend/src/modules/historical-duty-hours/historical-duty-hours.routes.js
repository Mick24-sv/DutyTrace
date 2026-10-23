import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { isDateKey } from '../semesters/semester.rules.js';
import * as historical from './historical-duty-hours.service.js';

export const historicalDutyHoursRouter = Router();
historicalDutyHoursRouter.use(requireAuth);

const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a valid month.');
const createSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  month: monthKey,
  granularity: z.enum(['monthly_total', 'daily']),
  workDate: z.string().refine(isDateKey, 'Enter a valid work date.').nullable().optional(),
  hours: z.number().positive().max(744).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Enter hours to at most two decimal places.'),
  verificationSource: z.string().trim().min(3).max(200),
  verificationReference: z.string().trim().min(3).max(500),
  reason: z.string().trim().min(5).max(1000),
  exceptional: z.boolean().default(false),
  amendsId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.granularity === 'daily' && !value.workDate) ctx.addIssue({ code: 'custom', path: ['workDate'], message: 'Choose a work date for a date-level credit.' });
  if (value.granularity === 'monthly_total' && value.workDate) ctx.addIssue({ code: 'custom', path: ['workDate'], message: 'Monthly totals do not use a work date.' });
  if (value.granularity === 'daily' && value.hours > 24) ctx.addIssue({ code: 'custom', path: ['hours'], message: 'A daily credit cannot exceed 24 hours.' });
});

historicalDutyHoursRouter.get('/options', requireRole('supervisor'), asyncHandler(async (req, res) => ok(res, await historical.options(req.user))));
historicalDutyHoursRouter.get('/mine', requireRole('supervisor'), asyncHandler(async (req, res) => ok(res, { items: await historical.listForSupervisor(req.user) })));
historicalDutyHoursRouter.post('/', requireRole('supervisor'), asyncHandler(async (req, res) => {
  ok(res, { item: await historical.create({ actor: req.user, input: parse(createSchema, req.body ?? {}), ip: req.ip }) }, 201);
}));

historicalDutyHoursRouter.get('/oversight', requireRole('admin'), asyncHandler(async (req, res) => ok(res, await historical.oversight(req.user))));
historicalDutyHoursRouter.post('/:id/approve', requireRole('admin'), asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(1000) }), req.body ?? {});
  ok(res, await historical.approve({ actor: req.user, id: parseId(req.params.id), reason, ip: req.ip }));
}));
historicalDutyHoursRouter.post('/:id/reject', requireRole('admin'), asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(1000) }), req.body ?? {});
  ok(res, await historical.reject({ actor: req.user, id: parseId(req.params.id), reason, ip: req.ip }));
}));
