import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { isDateKey } from '../common/access.js';
import { rawUpload, uploadedFile } from '../documents/upload.js';
import * as absences from './absences.service.js';

export const absencesRouter = Router();
absencesRouter.use(requireAuth);

const dateKey = z.string().refine(isDateKey, 'Use a real date like 2026-10-20.');
const text = (max, msg) => z.string().trim().min(1, msg).max(max, `Keep this under ${max} characters.`);
const statusSchema = z.enum(['pending', 'acknowledged', 'reviewed', 'needs_follow_up']).optional();

// Only these fields are read. There is NO user id, office or timestamp: the signed-in student, their
// current office and the server clock decide those. Submitting does NOT excuse an absence.
const createSchema = z.object({
  absenceType: z.enum(['planned', 'unexpected']),
  startDate: dateKey,
  endDate: dateKey.optional(),
  reason: text(2000, 'Please give a reason.'),
});

absencesRouter.post('/', requireRole('student'), asyncHandler(async (req, res) => {
  const b = parse(createSchema, req.body ?? {});
  ok(res, await absences.create({
    user: req.user, type: b.absenceType, startDate: b.startDate, endDate: b.endDate ?? b.startDate, reason: b.reason, ip: req.ip,
  }), 201);
}));

absencesRouter.get('/', requireRole('student', 'supervisor', 'admin'), asyncHandler(async (req, res) => {
  ok(res, { timezone: env.timezone, absences: await absences.list({ user: req.user, status: parse(statusSchema, req.query.status) }) });
}));

absencesRouter.get('/summary', requireRole('student', 'supervisor', 'admin'), asyncHandler(async (req, res) => ok(res, await absences.summary(req.user))));

absencesRouter.get('/:id', asyncHandler(async (req, res) => {
  ok(res, await absences.getDetail({ user: req.user, id: parseId(req.params.id) }));
}));

// ---- supervisor review (own office only)
const optionalResponse = z.object({ response: z.string().trim().max(2000).optional() });
const requiredResponse = z.object({ response: text(2000, 'Write a response for the student.') });
const id = (req) => parseId(req.params.id);

absencesRouter.post('/:id/acknowledge', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const { response } = parse(optionalResponse, req.body ?? {});
  ok(res, await absences.acknowledge({ user: req.user, id: id(req), response: response || undefined, ip: req.ip }));
}));
absencesRouter.post('/:id/review', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const { response } = parse(requiredResponse, req.body ?? {});
  ok(res, await absences.markReviewed({ user: req.user, id: id(req), response, ip: req.ip }));
}));
absencesRouter.post('/:id/follow-up', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const { response } = parse(requiredResponse, req.body ?? {});
  ok(res, await absences.requestFollowUp({ user: req.user, id: id(req), response, ip: req.ip }));
}));

// ---- student
absencesRouter.post('/:id/respond', requireRole('student'), asyncHandler(async (req, res) => {
  const { message } = parse(z.object({ message: text(2000, 'Write your answer.') }), req.body ?? {});
  ok(res, await absences.respond({ user: req.user, id: id(req), message, ip: req.ip }));
}));

// The body of this request is the file itself: POST ...?filename=letter.pdf (PDF, PNG or JPEG).
absencesRouter.post('/:id/documents', requireRole('student'), rawUpload, asyncHandler(async (req, res) => {
  const { buffer, rawName } = uploadedFile(req);
  ok(res, await absences.addDocument({ user: req.user, id: id(req), buffer, rawName, ip: req.ip }), 201);
}));

// ---- staff record something received by email / in person
export const receiptSchema = z.object({
  method: z.enum(['email', 'in_person']),
  receivedDate: dateKey,
  receivedById: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  requirementId: z.string().uuid().optional(),
});
absencesRouter.post('/:id/receipts', requireRole('supervisor'), asyncHandler(async (req, res) => {
  const b = parse(receiptSchema.omit({ requirementId: true }), req.body ?? {});
  ok(res, await absences.recordReceipt({
    user: req.user, id: id(req), method: b.method, receivedDate: b.receivedDate, receivedById: b.receivedById, notes: b.notes, ip: req.ip,
  }), 201);
}));
