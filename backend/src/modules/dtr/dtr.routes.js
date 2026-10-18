import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { isMonth } from '../attendance/attendance.service.js';
import * as dtr from './dtr.service.js';
import { renderDtrPdf } from './dtr.pdf.js';

export const dtrRouter = Router();
dtrRouter.use(requireAuth);

const monthSchema = z
  .string()
  .refine(isMonth, 'Month must look like 2026-09.')
  .refine((m) => Number(m.slice(0, 4)) >= 2000 && Number(m.slice(0, 4)) <= 2100, 'Month is out of range.');
const statusSchema = z.enum(['draft', 'submitted', 'under_review', 'approved', 'needs_correction']).optional();
const revisionSchema = z.coerce.number().int().min(1).max(10000).optional();

// ---------------------------------------------------------------- policy
// Everyone signed in may read the policy values; only an administrator changes them.
dtrRouter.get('/policy', asyncHandler(async (_req, res) => ok(res, await dtr.getPolicy())));

dtrRouter.put('/policy', requireRole('admin'), asyncHandler(async (req, res) => {
  const { requiredMonthlyHours } = parse(
    z.object({ requiredMonthlyHours: z.number().positive('Must be greater than 0.').max(744, 'Too large for one month.') }),
    req.body ?? {},
  );
  ok(res, await dtr.setRequiredHours({ actor: req.user, hours: requiredMonthlyHours, ip: req.ip }));
}));

// ---------------------------------------------------------------- student
// My ended months, with the DTR status of each.
dtrRouter.get('/mine', requireRole('student'), asyncHandler(async (req, res) => ok(res, await dtr.myOverview(req.user))));

// Read-only preview of a month (nothing stored). Only for months that have ended.
dtrRouter.get('/preview', requireRole('student'), asyncHandler(async (req, res) => {
  const month = parse(monthSchema, req.query.month);
  ok(res, await dtr.preview(req.user, month));
}));

// Generate my DTR for a month (or add a new revision while it is a draft / was returned).
dtrRouter.post('/', requireRole('student'), asyncHandler(async (req, res) => {
  const { month } = parse(z.object({ month: monthSchema }), req.body ?? {});
  ok(res, await dtr.generate({ user: req.user, month, ip: req.ip }), 201);
}));

// ------------------------------------------------------------------ read
// student: own; supervisor: own office (submitted and later); admin: all (read-only)
dtrRouter.get('/', asyncHandler(async (req, res) => {
  const status = parse(statusSchema, req.query.status);
  const month = req.query.month === undefined ? undefined : parse(monthSchema, req.query.month);
  ok(res, { dtrs: await dtr.list({ user: req.user, status, month }) });
}));

dtrRouter.get('/review-counts', requireRole('supervisor'), asyncHandler(async (req, res) => ok(res, await dtr.reviewQueueCounts(req.user))));

dtrRouter.get('/:id', asyncHandler(async (req, res) => {
  const revision = parse(revisionSchema, req.query.revision);
  ok(res, await dtr.getDetail({ user: req.user, id: parseId(req.params.id), revision }));
}));

dtrRouter.get('/:id/pdf', asyncHandler(async (req, res) => {
  const revision = parse(revisionSchema, req.query.revision);
  const detail = await dtr.getDetail({ user: req.user, id: parseId(req.params.id), revision });
  const pdf = await renderDtrPdf(detail);
  const safeName = detail.student.fullName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'student';
  res.status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `attachment; filename="DTR-${detail.month}-${safeName}-rev${detail.revision.number}.pdf"`,
      'Cache-Control': 'no-store',
    })
    .send(pdf);
}));

// -------------------------------------------------------------- workflow
const idOf = (req) => parseId(req.params.id);

dtrRouter.post('/:id/submit', requireRole('student'), asyncHandler(async (req, res) => {
  ok(res, await dtr.submit({ user: req.user, id: idOf(req), ip: req.ip }));
}));

dtrRouter.post('/:id/start-review', requireRole('supervisor'), asyncHandler(async (req, res) => {
  ok(res, await dtr.startReview({ user: req.user, id: idOf(req), ip: req.ip }));
}));

dtrRouter.post('/:id/approve', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const { acknowledgeIncomplete } = parse(z.object({ acknowledgeIncomplete: z.boolean().optional() }), req.body ?? {});
  ok(res, await dtr.approve({ user: req.user, id: idOf(req), acknowledgeIncomplete: acknowledgeIncomplete === true, ip: req.ip }));
}));

dtrRouter.post('/:id/return', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const { reason } = parse(
    z.object({ reason: z.string().trim().min(1, 'Tell the student what to correct.').max(1000, 'Keep the reason under 1000 characters.') }),
    req.body ?? {},
  );
  ok(res, await dtr.returnForCorrection({ user: req.user, id: idOf(req), reason, ip: req.ip }));
}));
