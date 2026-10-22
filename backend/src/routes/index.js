import { Router } from 'express';
import health from './health.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { officesRouter } from '../modules/offices/offices.routes.js';
import { qrRouter, supervisorQrRouter } from '../modules/qr/qr.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { dtrRouter } from '../modules/dtr/dtr.routes.js';
import { absencesRouter } from '../modules/absences/absences.routes.js';
import { casesRouter } from '../modules/cases/cases.routes.js';
import { documentsRouter } from '../modules/documents/documents.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';
import { semestersRouter } from '../modules/semesters/semesters.routes.js';
import { institutionsRouter } from '../modules/institutions/institutions.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { dutyRequirementsRouter } from '../modules/duty-requirements/duty-requirements.routes.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { forecastRouter } from '../modules/forecast/forecast.routes.js';
import { recoveryRouter } from '../modules/recovery/recovery.routes.js';
import { transitionsRouter } from '../modules/transitions/transitions.routes.js';
import { attendanceDiscrepanciesRouter } from '../modules/attendance-discrepancies/attendance-discrepancies.routes.js';
import { policyTemplatesRouter } from '../modules/policy-templates/policy-templates.routes.js';

// Feature routers (absences, compliance, ...) get mounted here in later phases.
export function buildRoutes(options = {}) {
  const router = Router();
  router.use('/health', health);
  router.use('/auth', authRoutes(options));
  router.use('/users', usersRouter);
  router.use('/offices/:officeId/qr', qrRouter); // before /offices so it matches first
  router.use('/supervisor/office-qr', supervisorQrRouter);
  router.use('/offices', officesRouter);
  router.use('/attendance', attendanceRouter);
  router.use('/attendance-discrepancies', attendanceDiscrepanciesRouter);
  router.use('/policy-templates', policyTemplatesRouter);
  router.use('/dtrs', dtrRouter);
  router.use('/absences', absencesRouter);
  router.use('/cases', casesRouter);
  router.use('/documents', documentsRouter);
  router.use('/reports', reportsRouter);
  router.use('/semesters', semestersRouter);
  router.use('/institutions', institutionsRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/duty-schedules', dutyRequirementsRouter);
  router.use('/audit', auditRouter);
  router.use('/forecast', forecastRouter);
  router.use('/recovery', recoveryRouter);
  router.use('/semester-transitions', transitionsRouter);
  return router;
}
