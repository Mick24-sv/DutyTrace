import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as policies from './policy-templates.service.js';
import { isDateKey } from '../semesters/semester.rules.js';

export const policyTemplatesRouter = Router();
policyTemplatesRouter.use(requireAuth);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const date = z.string().refine(isDateKey,'Choose a valid calendar date.');
const optionalHours = (max) => z.number().positive().max(max).nullable();
const optionalMinutes = z.number().int().min(0).max(1440).nullable();
const optionalBoolean = z.boolean().nullable();
const windowSchema = z.object({startTime:time,endTime:time})
  .refine((w)=>w.endTime>w.startTime,'Time windows must end after they start; overnight windows are not supported by the schedule engine.');

const configurationSchema = z.object({
  duty:z.object({requiredTermHours:optionalHours(10000),minimumDailyHours:optionalHours(24),maximumDailyHours:optionalHours(24),
    maximumWeeklyHours:optionalHours(168),permittedWeekdays:z.array(z.number().int().min(1).max(7)).max(7)
      .refine((values)=>new Set(values).size===values.length,'Duty weekdays must be unique.'),
    permittedTimeWindows:z.array(windowSchema).max(8),completionDeadline:date.nullable()}),
  attendance:z.object({earlyClockInToleranceMinutes:optionalMinutes,lateClockOutToleranceMinutes:optionalMinutes,
    missingClockOutGraceMinutes:optionalMinutes,duplicateScanHandling:z.enum(['reject_and_log','allow_and_flag']).nullable(),
    attendanceOutsideApprovedShift:z.enum(['allow_and_flag','block']).nullable(),approvedOvertimeAllowed:optionalBoolean,
    correctionApproval:z.enum(['supervisor','administrator']).nullable(),supervisorReviewRequired:optionalBoolean,
    discrepancyEscalationHours:z.number().int().min(1).max(720).nullable()}),
  absence:z.object({advanceExplanationRequired:optionalBoolean,submissionDeadlineHours:z.number().int().min(0).max(8760).nullable(),
    supervisorReviewRequired:optionalBoolean,supportingDocumentRequired:optionalBoolean,incompleteDutyExplanationRequired:optionalBoolean,
    endOfSemesterOutstandingHourReviewRequired:optionalBoolean,administratorApprovalRequired:optionalBoolean,notifyStudent:optionalBoolean}),
  dtr:z.object({requiredMonthlyHours:optionalHours(744),reviewSlaHours:z.number().int().min(1).max(720).nullable(),
    institutionName:z.string().trim().max(160).nullable(),headerText:z.string().trim().max(500).nullable(),
    dateFormat:z.enum(['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY']).nullable(),timeFormat:z.enum(['12-hour','24-hour']).nullable(),
    includeStudentInformation:optionalBoolean,includeOfficeSupervisorInformation:optionalBoolean,includeReportingPeriod:optionalBoolean,
    includeAttendanceColumns:optionalBoolean,includeDailyTotals:optionalBoolean,includeMonthlyTotals:optionalBoolean,
    includeVerifiedAdjustments:optionalBoolean,signatureFields:z.array(z.string().trim().min(1).max(80)).max(8)}),
  transition:z.object({outstandingHoursPolicy:z.enum(['keep_original','manual_review']).nullable(),requireStudentConfirmation:optionalBoolean,
    administratorApprovalRequired:optionalBoolean}),
  risk:z.object({completionWarningDays:z.number().int().min(1).max(180).nullable(),criticalCompletionDays:z.number().int().min(0).max(30).nullable(),
    deadlineReminderDays:z.array(z.number().int().min(0).max(180)).max(10),upcomingShiftReminderHours:z.number().int().min(1).max(168).nullable(),
    escalationAfterHours:z.number().int().min(1).max(720).nullable()}),
}).strict().superRefine((config,ctx)=>{
  const d=config.duty;
  if(d.minimumDailyHours!=null&&d.maximumDailyHours!=null&&d.minimumDailyHours>d.maximumDailyHours)
    ctx.addIssue({code:'custom',path:['duty','maximumDailyHours'],message:'Minimum daily hours cannot exceed maximum daily hours.'});
  if(d.maximumWeeklyHours!=null&&d.minimumDailyHours!=null&&d.maximumWeeklyHours<d.minimumDailyHours)
    ctx.addIssue({code:'custom',path:['duty','maximumWeeklyHours'],message:'Maximum weekly hours must allow at least one minimum-length duty day.'});
  if(Boolean(d.permittedWeekdays.length)!==Boolean(d.permittedTimeWindows.length))
    ctx.addIssue({code:'custom',path:['duty','permittedTimeWindows'],message:'Configure both permitted days and time windows, or leave both empty.'});
  for(let i=0;i<d.permittedTimeWindows.length;i++)for(let j=i+1;j<d.permittedTimeWindows.length;j++){
    const a=d.permittedTimeWindows[i],b=d.permittedTimeWindows[j];
    if(a.startTime<b.endTime&&b.startTime<a.endTime)ctx.addIssue({code:'custom',path:['duty','permittedTimeWindows',j],message:'Permitted time windows cannot overlap.'});
  }
  if(new Set(config.risk.deadlineReminderDays).size!==config.risk.deadlineReminderDays.length)
    ctx.addIssue({code:'custom',path:['risk','deadlineReminderDays'],message:'Deadline reminder days must be unique.'});
  if(config.dtr.signatureFields.some((v,i,a)=>a.indexOf(v)!==i))
    ctx.addIssue({code:'custom',path:['dtr','signatureFields'],message:'Signature fields must be unique.'});
});

const draftSchema=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(2000).default(''),
  configuration:configurationSchema,reason:z.string().trim().min(5).max(1000)});
const applySchema=z.object({termId:z.string().uuid(),scopeType:z.enum(['institution','office','student']),scopeId:z.string().uuid().optional(),
  effectiveStartsOn:date,effectiveEndsOn:date,reason:z.string().trim().min(5).max(1000),confirmed:z.literal(true)})
  .refine((v)=>v.effectiveEndsOn>=v.effectiveStartsOn,{path:['effectiveEndsOn'],message:'End date must not precede start date.'})
  .refine((v)=>v.scopeType==='institution'||Boolean(v.scopeId),{path:['scopeId'],message:'Choose an office or Student Assistant.'});

policyTemplatesRouter.get('/terms',requireRole('admin','supervisor','student'),asyncHandler(async(req,res)=>ok(res,{terms:await policies.listTerms(req.user)})));
policyTemplatesRouter.get('/effective/:termId',requireRole('admin','supervisor','student'),asyncHandler(async(req,res)=>{
  const dateValue=req.query.date;
  if(dateValue!==undefined&&!date.safeParse(dateValue).success)throw new AppError(400,'VALIDATION_ERROR','Choose a valid policy date.');
  ok(res,await policies.effectivePolicyForUser({user:req.user,termId:parseId(req.params.termId),date:dateValue??null}));
}));
policyTemplatesRouter.get('/',requireRole('admin'),asyncHandler(async(req,res)=>ok(res,{templates:await policies.listTemplates(req.user)})));
policyTemplatesRouter.post('/',requireRole('admin'),asyncHandler(async(req,res)=>{
  const input=parse(draftSchema,req.body??{});ok(res,await policies.createTemplate({user:req.user,input,ip:req.ip}),201);
}));
policyTemplatesRouter.get('/:templateId',requireRole('admin'),asyncHandler(async(req,res)=>
  ok(res,await policies.getTemplate(req.user,parseId(req.params.templateId)))));
policyTemplatesRouter.put('/:templateId/draft',requireRole('admin'),asyncHandler(async(req,res)=>{
  const input=parse(draftSchema,req.body??{});ok(res,await policies.updateTemplate({user:req.user,templateId:parseId(req.params.templateId),input,ip:req.ip}));
}));
policyTemplatesRouter.post('/:templateId/duplicate',requireRole('admin'),asyncHandler(async(req,res)=>{
  const input=parse(z.object({versionId:z.string().uuid(),name:z.string().trim().min(1).max(120),description:z.string().max(2000).optional(),reason:z.string().trim().min(5).max(1000)}),req.body??{});
  ok(res,await policies.duplicateTemplate({user:req.user,templateId:parseId(req.params.templateId),input,ip:req.ip}),201);
}));
policyTemplatesRouter.post('/:templateId/versions/:versionId/publish',requireRole('admin'),asyncHandler(async(req,res)=>{
  parse(z.object({confirmed:z.literal(true)}),req.body??{});
  ok(res,await policies.publishVersion({user:req.user,templateId:parseId(req.params.templateId),versionId:parseId(req.params.versionId),ip:req.ip}));
}));
policyTemplatesRouter.post('/:templateId/versions/:versionId/apply',requireRole('admin'),asyncHandler(async(req,res)=>{
  const input=parse(applySchema,req.body??{});
  ok(res,{assignment:await policies.applyVersion({user:req.user,templateId:parseId(req.params.templateId),versionId:parseId(req.params.versionId),input,ip:req.ip})},201);
}));
policyTemplatesRouter.post('/:templateId/archive',requireRole('admin'),asyncHandler(async(req,res)=>{
  parse(z.object({confirmed:z.literal(true)}),req.body??{});
  ok(res,await policies.archiveTemplate({user:req.user,templateId:parseId(req.params.templateId),ip:req.ip}));
}));
