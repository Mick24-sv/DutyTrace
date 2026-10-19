import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { isDateKey } from '../semesters/semester.rules.js';
import * as duty from './duty-requirements.service.js';

const route = Router();
route.use(requireAuth);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const dutyDay = z.object({
  weekday: z.number().int().min(1).max(7),
  startsAt: time,
  endsAt: time,
  afternoonStartsAt: time.nullable().optional(),
  afternoonEndsAt: time.nullable().optional(),
})
  .refine((day) => day.endsAt > day.startsAt, { message: 'Morning end time must be after its start time; overnight duty is not supported.' })
  .refine((day) => (day.afternoonStartsAt == null) === (day.afternoonEndsAt == null), {
    message: 'Set both afternoon start and end times, or leave both empty.',
    path: ['afternoonEndsAt'],
  })
  .refine((day) => day.afternoonStartsAt == null || day.endsAt <= day.afternoonStartsAt, {
    message: 'Afternoon duty must start after the morning period ends.',
    path: ['afternoonStartsAt'],
  })
  .refine((day) => day.afternoonStartsAt == null || day.afternoonEndsAt > day.afternoonStartsAt, {
    message: 'Afternoon end time must be after its start time; overnight duty is not supported.',
    path: ['afternoonEndsAt'],
  });
const days = z.array(dutyDay)
  .min(1).max(7).refine((items) => new Set(items.map((item) => item.weekday)).size === items.length, 'Use at most one duty period per weekday.');
const period = z.object({
  effectiveStartsOn: z.string().refine(isDateKey),
  effectiveEndsOn: z.string().refine(isDateKey),
  days,
}).refine((item) => item.effectiveEndsOn >= item.effectiveStartsOn, { path: ['effectiveEndsOn'], message: 'End date must follow start date.' });

route.get('/mine', requireRole('student'), asyncHandler(async (req, res) => {
  ok(res, { terms: await duty.studentTerms(req.user) });
}));

route.get('/admin/:termId', requireRole('admin'), asyncHandler(async (req, res) => {
  ok(res, await duty.adminContext({ actor: req.user, termId: parseId(req.params.termId) }));
}));
route.put('/admin/default', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(z.object({ minimumDailyHours: z.number().positive().max(24) }), req.body ?? {});
  ok(res, { minimumDailyHours: await duty.updateDefaultMinimum({ actor: req.user, ...input, ip: req.ip }) });
}));

const policySchema = z.object({
  termId: z.string().uuid(),
  scopeType: z.enum(['institution', 'office', 'student']),
  scopeId: z.string().uuid().optional(),
  effectiveStartsOn: z.string().refine(isDateKey),
  effectiveEndsOn: z.string().refine(isDateKey),
  requiredTermHours: z.number().positive().max(10000).nullable().optional(),
  minimumDailyHours: z.number().positive().max(24).nullable().optional(),
  maximumDailyHours: z.number().positive().max(24).nullable().optional(),
  permittedWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine((values) => new Set(values).size === values.length, 'Weekdays must be unique.'),
  permittedTimeWindows: z.array(z.object({ startTime: time, endTime: time })
    .refine((window) => window.endTime > window.startTime, 'Time window must end after it starts.')).min(1).max(8),
  exceptionReason: z.string().trim().min(5).max(1000).optional(),
}).refine((item) => item.effectiveEndsOn >= item.effectiveStartsOn, { path: ['effectiveEndsOn'], message: 'End date must follow start date.' })
  .refine((item) => item.maximumDailyHours == null || item.minimumDailyHours == null || item.maximumDailyHours >= item.minimumDailyHours, { path: ['maximumDailyHours'], message: 'Maximum daily hours must be at least the minimum.' })
  .refine((item) => item.scopeType === 'institution' || Boolean(item.scopeId), { path: ['scopeId'], message: 'Choose an office or student.' })
  .refine((item) => item.permittedTimeWindows.every((window, i, all) => all.slice(i + 1).every((other) => window.endTime <= other.startTime || other.endTime <= window.startTime)), { path: ['permittedTimeWindows'], message: 'Permitted time windows cannot overlap.' });

route.post('/admin/policies', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(policySchema, req.body ?? {});
  ok(res, { policy: await duty.savePolicy({ actor: req.user, input, ip: req.ip }) }, 201);
}));
route.put('/admin/policies/:policyId', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(policySchema, req.body ?? {});
  ok(res, { policy: await duty.savePolicy({ actor: req.user, policyId: parseId(req.params.policyId), input, ip: req.ip }) });
}));

route.post('/', requireRole('student'), asyncHandler(async (req, res) => {
  const input = parse(z.object({ termId: z.string().uuid(), ...period.shape }), req.body ?? {});
  const { days: proposed, ...dates } = input;
  ok(res, { schedule: await duty.createDraft({ user: req.user, termId: input.termId, ...dates, days: proposed, ip: req.ip }) }, 201);
}));
route.put('/:scheduleId', requireRole('student'), asyncHandler(async (req, res) => {
  const input = parse(period, req.body ?? {});
  ok(res, { schedule: await duty.updateDraft({ user: req.user, scheduleId: parseId(req.params.scheduleId), ...input, ip: req.ip }) });
}));
route.post('/:scheduleId/submit', requireRole('student'), asyncHandler(async (req, res) => {
  ok(res, { schedule: await duty.submitSchedule({ user: req.user, scheduleId: parseId(req.params.scheduleId), ip: req.ip }) });
}));
route.get('/review', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  ok(res, { schedules: await duty.reviewQueue({ actor: req.user, termId: req.query.termId ? parseId(req.query.termId) : null }) });
}));
route.get('/review/:scheduleId', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  ok(res, { schedule: await duty.supervisorScheduleDetail({ actor: req.user, scheduleId: parseId(req.params.scheduleId) }) });
}));
route.post('/review/:scheduleId/decision', requireRole('admin', 'supervisor'), asyncHandler(async (req, res) => {
  const input = parse(z.object({
    decision: z.enum(['approve', 'reject', 'request_changes']),
    reason: z.string().trim().max(1000).optional(),
    suggestedDays: days.optional(),
  }), req.body ?? {});
  ok(res, { schedule: await duty.decideSchedule({ actor: req.user, scheduleId: parseId(req.params.scheduleId), ...input, ip: req.ip }) });
}));

export const dutyRequirementsRouter = route;
