import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import {
  getStudentForecast,
  getOfficeForecasts,
  getInstitutionForecasts,
} from './forecast.service.js';

export const forecastRouter = Router();
forecastRouter.use(requireAuth);

const querySchema = z.object({
  termId: z.string().uuid().optional(),
});

// GET /api/forecast/mine - Student Assistant sees their own forecast
forecastRouter.get('/mine', requireRole('student'), asyncHandler(async (req, res) => {
  const { termId } = parse(querySchema, req.query);
  const data = await getStudentForecast(req.user.id, {
    termId,
    actor: req.user,
  });
  ok(res, data);
}));

// GET /api/forecast/students/:studentId - Authorized view of a single student forecast
forecastRouter.get('/students/:studentId', asyncHandler(async (req, res) => {
  const studentId = parseId(req.params.studentId);
  const { termId } = parse(querySchema, req.query);
  const data = await getStudentForecast(studentId, {
    termId,
    actor: req.user,
  });
  ok(res, data);
}));

// GET /api/forecast/office/:officeId - Supervisor / Admin view of office forecasts
forecastRouter.get('/office/:officeId', requireRole('supervisor', 'admin'), asyncHandler(async (req, res) => {
  const officeId = parseId(req.params.officeId);
  const { termId } = parse(querySchema, req.query);
  const data = await getOfficeForecasts(officeId, {
    termId,
    actor: req.user,
  });
  ok(res, data);
}));

// GET /api/forecast/institution - Admin institution-wide forecasts
forecastRouter.get('/institution', requireRole('admin'), asyncHandler(async (req, res) => {
  const { termId } = parse(querySchema, req.query);
  const data = await getInstitutionForecasts({
    termId,
    actor: req.user,
  });
  ok(res, data);
}));

