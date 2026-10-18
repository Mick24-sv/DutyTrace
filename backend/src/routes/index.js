import { Router } from 'express';
import health from './health.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { officesRouter } from '../modules/offices/offices.routes.js';
import { qrRouter } from '../modules/qr/qr.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { dtrRouter } from '../modules/dtr/dtr.routes.js';
import { absencesRouter } from '../modules/absences/absences.routes.js';
import { casesRouter } from '../modules/cases/cases.routes.js';
import { documentsRouter } from '../modules/documents/documents.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';

// Feature routers (absences, compliance, ...) get mounted here in later phases.
export function buildRoutes(options = {}) {
  const router = Router();
  router.use('/health', health);
  router.use('/auth', authRoutes(options));
  router.use('/users', usersRouter);
  router.use('/offices/:officeId/qr', qrRouter); // before /offices so it matches first
  router.use('/offices', officesRouter);
  router.use('/attendance', attendanceRouter);
  router.use('/dtrs', dtrRouter);
  router.use('/absences', absencesRouter);
  router.use('/cases', casesRouter);
  router.use('/documents', documentsRouter);
  router.use('/reports', reportsRouter);
  return router;
}
