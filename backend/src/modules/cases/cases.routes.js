import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { isDateKey } from '../common/access.js';
import { rawUpload, uploadedFile } from '../documents/upload.js';
import { receiptSchema } from '../absences/absences.routes.js';
import * as cases from './cases.service.js';

export const casesRouter = Router();
casesRouter.use(requireAuth);

const dateKey = z.string().refine(isDateKey, 'Use a real date like 2026-10-20.');
const text = (max, msg) => z.string().trim().min(1, msg).max(max, `Keep this under ${max} characters.`);
const label = text(200, 'Name the document.');
const statusSchema = z.enum(['open', 'documents_pending', 'under_review', 'needs_correction', 'resolved', 'closed']).optional();
const id = (req) => parseId(req.params.id);

// ---------------------------------------------------- case types (administrator)
const typeBody = {
  name: text(120, 'Give the type a name.'),
  description: z.string().trim().max(1000).optional(),
  requiredDocuments: z.array(label).max(20, 'At most 20 documents.'),
};
casesRouter.get('/types', requireRole('admin'), asyncHandler(async (_req, res) => ok(res, { types: await cases.listTypes() })));
casesRouter.post('/types', requireRole('admin'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/, '2-30 letters, numbers, - or _.'),
    ...typeBody,
    requiredDocuments: typeBody.requiredDocuments.default([]),
  }), req.body ?? {});
  ok(res, await cases.createType({ actor: req.user, ...b, ip: req.ip }), 201);
}));
casesRouter.patch('/types/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const patch = parse(z.object({
    name: typeBody.name.optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    requiredDocuments: typeBody.requiredDocuments.optional(),
    isActive: z.boolean().optional(),
  }), req.body ?? {});
  ok(res, await cases.updateType({ actor: req.user, id: id(req), patch, ip: req.ip }));
}));

// ------------------------------------------------------------------- cases
// Cases are opened by an administrator, never automatically from hours or absence notices.
casesRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    userId: z.string().uuid('Choose a Student Assistant.'),
    caseTypeId: z.string().uuid('Choose a case type.'),
    description: text(4000, 'Describe the case.'),
    periodStart: dateKey,
    periodEnd: dateKey,
    requirements: z.array(label).max(20).optional(),
  }), req.body ?? {});
  ok(res, await cases.createCase({ actor: req.user, ...b, extraRequirements: b.requirements, ip: req.ip }), 201);
}));

casesRouter.get('/', asyncHandler(async (req, res) => {
  const userId = req.query.userId === undefined ? undefined : parseId(req.query.userId);
  ok(res, { timezone: env.timezone, cases: await cases.list({ user: req.user, status: parse(statusSchema, req.query.status), userId }) });
}));
casesRouter.get('/summary', asyncHandler(async (req, res) => ok(res, await cases.summary(req.user))));
casesRouter.get('/:id', asyncHandler(async (req, res) => ok(res, await cases.getDetail({ user: req.user, id: id(req) }))));

// ---- student
casesRouter.post('/:id/submit', requireRole('student'), asyncHandler(async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().max(2000).optional() }), req.body ?? {});
  ok(res, await cases.submit({ user: req.user, id: id(req), message: message || undefined, ip: req.ip }));
}));
casesRouter.post('/:id/respond', requireRole('student'), asyncHandler(async (req, res) => {
  const { message } = parse(z.object({ message: text(2000, 'Write your response to the correction request.') }), req.body ?? {});
  ok(res, await cases.respond({ user: req.user, id: id(req), message, ip: req.ip }));
}));
// Body = the file. Optional ?requirementId=<uuid> says which requested document it satisfies.
casesRouter.post('/:id/documents', requireRole('student'), rawUpload, asyncHandler(async (req, res) => {
  const { buffer, rawName } = uploadedFile(req);
  const requirementId = req.query.requirementId === undefined ? null : parseId(req.query.requirementId);
  ok(res, await cases.addDocument({ user: req.user, id: id(req), requirementId, buffer, rawName, ip: req.ip }), 201);
}));

// ---- administrator
const admin = requireRole('admin');
casesRouter.post('/:id/start-review', admin, asyncHandler(async (req, res) => ok(res, await cases.startReview({ user: req.user, id: id(req), ip: req.ip }))));
casesRouter.post('/:id/request-correction', admin, asyncHandler(async (req, res) => {
  const { note } = parse(z.object({ note: text(2000, 'Say what needs to be corrected.') }), req.body ?? {});
  ok(res, await cases.requestCorrection({ user: req.user, id: id(req), note, ip: req.ip }));
}));
casesRouter.post('/:id/resolve', admin, asyncHandler(async (req, res) => {
  const b = parse(z.object({ decision: text(4000, 'Record the final decision.'), resolutionDate: dateKey.optional() }), req.body ?? {});
  ok(res, await cases.resolve({ user: req.user, id: id(req), decision: b.decision, resolutionDate: b.resolutionDate, ip: req.ip }));
}));
casesRouter.post('/:id/reopen', admin, asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: text(2000, 'Say why the case is being reopened.') }), req.body ?? {});
  ok(res, await cases.reopen({ user: req.user, id: id(req), reason, ip: req.ip }));
}));
casesRouter.post('/:id/close', admin, asyncHandler(async (req, res) => {
  const { note } = parse(z.object({ note: text(2000, 'Say why the case is being closed.') }), req.body ?? {});
  ok(res, await cases.close({ user: req.user, id: id(req), note, ip: req.ip }));
}));
casesRouter.post('/:id/requirements', admin, asyncHandler(async (req, res) => {
  const { label: l } = parse(z.object({ label }), req.body ?? {});
  ok(res, await cases.addRequirement({ user: req.user, id: id(req), label: l, ip: req.ip }), 201);
}));
casesRouter.post('/:id/requirements/:requirementId/waive', admin, asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: text(1000, 'Say why this requirement is waived.') }), req.body ?? {});
  ok(res, await cases.waiveRequirement({ user: req.user, id: id(req), requirementId: parseId(req.params.requirementId), reason, ip: req.ip }));
}));

// ---- staff: administrators and the supervisor of the case's office
const staff = requireRole('admin', 'supervisor');
casesRouter.post('/:id/notes', staff, asyncHandler(async (req, res) => {
  const { note } = parse(z.object({ note: text(2000, 'Write the note.') }), req.body ?? {});
  ok(res, await cases.addNote({ user: req.user, id: id(req), note, ip: req.ip }), 201);
}));
casesRouter.post('/:id/receipts', staff, asyncHandler(async (req, res) => {
  const b = parse(receiptSchema, req.body ?? {});
  ok(res, await cases.recordReceipt({ user: req.user, id: id(req), ...b, ip: req.ip }), 201);
}));
