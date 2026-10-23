import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as semesters from './semesters.service.js';
import { isDateKey } from './semester.rules.js';

export const semestersRouter = Router();
semestersRouter.use(requireAuth);

const termSchema = z.object({
  academicYear: z.string().trim().min(1).max(30),
  semester: z.enum(['first', 'second', 'summer']),
  startsOn: z.string().refine(isDateKey, 'Enter a valid start date.'),
  endsOn: z.string().refine(isDateKey, 'Enter a valid end date.'),
  completionDeadline: z.string().refine(isDateKey, 'Enter a valid deadline.').nullable(),
  timezone: z.string().trim().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Enter a valid IANA timezone.'),
}).refine((term) => term.endsOn >= term.startsOn, {
  message: 'End date must be on or after the start date.',
  path: ['endsOn'],
}).refine((term) => term.completionDeadline == null || term.completionDeadline >= term.startsOn, {
  message: 'Deadline must be on or after the start date.',
  path: ['completionDeadline'],
});

semestersRouter.get('/mine', requireRole('student'), asyncHandler(async (req, res) => {
  ok(res, { terms: await semesters.myTerms(req.user) });
}));

semestersRouter.get('/mine/:termId/monthly-summary', requireRole('student'), asyncHandler(async (req, res) => {
  ok(res, await semesters.myMonthlySummary(req.user, parseId(req.params.termId)));
}));

semestersRouter.get('/current', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  ok(res, { term: await semesters.currentTerm(req.user.institutionId) });
}));

semestersRouter.get('/current/office', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const term = await semesters.currentTerm(req.user.institutionId);
  if (!term || !req.user.office?.id) {
    ok(res, { term, office: req.user.office ?? null, students: [] });
    return;
  }
  ok(res, await semesters.officeProgress({ actor: req.user, termId: term.id, officeId: req.user.office.id }));
}));

semestersRouter.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  ok(res, { terms: await semesters.listTerms(req.user.institutionId) });
}));

semestersRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(termSchema, req.body ?? {});
  ok(res, { term: await semesters.saveTerm({ actor: req.user, input, ip: req.ip }) }, 201);
}));

semestersRouter.put('/:termId', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(termSchema, req.body ?? {});
  ok(res, { term: await semesters.saveTerm({ actor: req.user, termId: parseId(req.params.termId), input, ip: req.ip }) });
}));

semestersRouter.post('/:termId/finalize', requireRole('admin'), asyncHandler(async (req, res) => {
  ok(res, { term: await semesters.finalizeTerm({ actor: req.user, termId: parseId(req.params.termId), ip: req.ip }) });
}));

semestersRouter.get('/:termId/requirements', requireRole('admin'), asyncHandler(async (req, res) => {
  ok(res, { requirements: await semesters.listRequirements({ actor: req.user, termId: parseId(req.params.termId) }) });
}));

semestersRouter.put('/:termId/requirements/:studentId', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(z.object({
    officeId: z.string().uuid(),
    requiredHours: z.number().positive().max(10000).nullable(),
  }), req.body ?? {});
  ok(res, {
    assignment: await semesters.assignRequirement({
      actor: req.user,
      termId: parseId(req.params.termId),
      studentId: parseId(req.params.studentId),
      ...input,
      ip: req.ip,
    }),
  });
}));

semestersRouter.get('/:termId/office/:officeId', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const termId = parseId(req.params.termId);
  const officeId = parseId(req.params.officeId);
  if (req.user.role === 'admin') {
    ok(res, await semesters.allInstitutionProgress({ actor: req.user, termId }));
    return;
  }
  ok(res, await semesters.officeProgress({ actor: req.user, termId, officeId }));
}));
