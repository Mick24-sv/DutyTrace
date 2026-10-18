import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import { isMonth } from '../attendance/attendance.service.js';
import { isDateKey } from '../common/access.js';
import { generateCsv } from './csv.js';
import * as reports from './reports.service.js';

export const reportsRouter = Router();

// Reports are restricted to Admin and Supervisor
reportsRouter.use(requireAuth);
reportsRouter.use(requireRole('admin', 'supervisor'));

const monthSchema = z
  .string()
  .refine(isMonth, 'Month must look like 2026-10.')
  .optional();

const dateSchema = z
  .string()
  .refine(isDateKey, 'Date must look like 2026-10-20.')
  .optional();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  format: z.enum(['json', 'csv']).default('json'),
});

function sendCsv(res, filename, columns, rows) {
  const csvData = generateCsv(columns, rows);
  res.status(200).set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  }).send(csvData);
}

// -------------------------------------------------------------------------
// Dashboard Stats
// -------------------------------------------------------------------------
reportsRouter.get('/dashboard-stats', asyncHandler(async (req, res) => {
  ok(res, await reports.getDashboardStats(req.user));
}));

// -------------------------------------------------------------------------
// 1. Attendance Report
// -------------------------------------------------------------------------
const attendanceQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: dateSchema,
  to: dateSchema,
  month: monthSchema,
});

reportsRouter.get('/attendance', asyncHandler(async (req, res) => {
  const q = parse(attendanceQuerySchema, req.query ?? {});
  const data = await reports.attendanceReport({
    user: req.user,
    officeId: q.officeId,
    userId: q.userId,
    from: q.from,
    to: q.to,
    month: q.month,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `attendance-report-${data.filters.from}-to-${data.filters.to}.csv`, reports.attendanceCsvColumns, data.items);
  }
  return ok(res, data);
}));

// -------------------------------------------------------------------------
// 2. Recorded vs. Verified Hours Report
// -------------------------------------------------------------------------
const hoursQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  month: monthSchema,
});

reportsRouter.get('/hours', asyncHandler(async (req, res) => {
  const q = parse(hoursQuerySchema, req.query ?? {});
  const data = await reports.hoursReport({
    user: req.user,
    officeId: q.officeId,
    month: q.month,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `hours-report-${data.filters.month}.csv`, reports.hoursCsvColumns, data.items);
  }
  return ok(res, data);
}));

// -------------------------------------------------------------------------
// 3. Monthly DTR Status Report
// -------------------------------------------------------------------------
const dtrQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  month: monthSchema,
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'needs_correction']).optional(),
});

reportsRouter.get('/dtr', asyncHandler(async (req, res) => {
  const q = parse(dtrQuerySchema, req.query ?? {});
  const data = await reports.dtrReport({
    user: req.user,
    officeId: q.officeId,
    month: q.month,
    status: q.status,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `dtr-status-report-${q.month || 'all'}.csv`, reports.dtrCsvColumns, data.items);
  }
  return ok(res, data);
}));

// -------------------------------------------------------------------------
// 4. Outstanding Duty-Hour Requirements Report
// -------------------------------------------------------------------------
const outstandingQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  month: monthSchema,
});

reportsRouter.get('/outstanding-requirements', asyncHandler(async (req, res) => {
  const q = parse(outstandingQuerySchema, req.query ?? {});
  const data = await reports.outstandingRequirementsReport({
    user: req.user,
    officeId: q.officeId,
    month: q.month,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `outstanding-requirements-${data.filters.month}.csv`, reports.outstandingCsvColumns, data.items);
  }
  return ok(res, data);
}));

// -------------------------------------------------------------------------
// 5. Absence Notifications Report
// -------------------------------------------------------------------------
const absencesQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  status: z.enum(['pending', 'acknowledged', 'reviewed', 'needs_follow_up']).optional(),
  type: z.enum(['planned', 'unexpected']).optional(),
  from: dateSchema,
  to: dateSchema,
});

reportsRouter.get('/absences', asyncHandler(async (req, res) => {
  const q = parse(absencesQuerySchema, req.query ?? {});
  const data = await reports.absencesReport({
    user: req.user,
    officeId: q.officeId,
    status: q.status,
    type: q.type,
    from: q.from,
    to: q.to,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `absence-notifications-report.csv`, reports.absencesCsvColumns, data.items);
  }
  return ok(res, data);
}));

// -------------------------------------------------------------------------
// 6. Compliance Cases Report
// -------------------------------------------------------------------------
const casesQuerySchema = paginationSchema.extend({
  officeId: z.string().uuid().optional(),
  status: z.enum(['open', 'documents_pending', 'under_review', 'needs_correction', 'resolved', 'closed']).optional(),
  caseTypeId: z.string().uuid().optional(),
  from: dateSchema,
  to: dateSchema,
});

reportsRouter.get('/cases', asyncHandler(async (req, res) => {
  const q = parse(casesQuerySchema, req.query ?? {});
  const data = await reports.casesReport({
    user: req.user,
    officeId: q.officeId,
    status: q.status,
    caseTypeId: q.caseTypeId,
    from: q.from,
    to: q.to,
    page: q.format === 'csv' ? 1 : q.page,
    limit: q.format === 'csv' ? 10000 : q.limit,
  });

  if (q.format === 'csv') {
    return sendCsv(res, `compliance-cases-report.csv`, reports.casesCsvColumns, data.items);
  }
  return ok(res, data);
}));

