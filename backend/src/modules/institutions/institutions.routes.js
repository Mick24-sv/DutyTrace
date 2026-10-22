import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import { recordAudit } from '../audit/audit.service.js';

export const institutionsRouter = Router();
institutionsRouter.use(requireAuth);

institutionsRouter.get('/me', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, timezone, attendance_discrepancy_grace_minutes, attendance_early_tolerance_minutes, attendance_late_tolerance_minutes, created_at FROM institutions WHERE id = $1',
    [req.user.institutionId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
  ok(res, {
    institution: {
      id: rows[0].id,
      name: rows[0].name,
      timezone: rows[0].timezone,
      attendanceDiscrepancyGraceMinutes: rows[0].attendance_discrepancy_grace_minutes,
      attendanceEarlyToleranceMinutes: rows[0].attendance_early_tolerance_minutes,
      attendanceLateToleranceMinutes: rows[0].attendance_late_tolerance_minutes,
      createdAt: rows[0].created_at,
    },
  });
}));

institutionsRouter.patch('/me/attendance-policy', requireRole('admin'), asyncHandler(async (req,res)=>{
  const input=parse(z.object({
    discrepancyGraceMinutes:z.number().int().min(0).max(1440),
    earlyToleranceMinutes:z.number().int().min(0).max(1440),
    lateToleranceMinutes:z.number().int().min(0).max(1440),
  }),req.body??{});
  const institution=await withTransaction(async db=>{
    const {rows:[before]}=await db.query(`SELECT * FROM institutions WHERE id=$1 FOR UPDATE`,[req.user.institutionId]);
    if(!before) throw new AppError(404,'NOT_FOUND','Institution not found.');
    const {rows:[updated]}=await db.query(`UPDATE institutions SET attendance_discrepancy_grace_minutes=$2,
      attendance_early_tolerance_minutes=$3,attendance_late_tolerance_minutes=$4 WHERE id=$1
      RETURNING id,name,timezone,attendance_discrepancy_grace_minutes,attendance_early_tolerance_minutes,attendance_late_tolerance_minutes`,
    [req.user.institutionId,input.discrepancyGraceMinutes,input.earlyToleranceMinutes,input.lateToleranceMinutes]);
    await recordAudit({actorId:req.user.id,institutionId:req.user.institutionId,action:'institution.attendance_policy_update',
      targetType:'institution',targetId:updated.id,before:{discrepancyGraceMinutes:before.attendance_discrepancy_grace_minutes,
        earlyToleranceMinutes:before.attendance_early_tolerance_minutes,lateToleranceMinutes:before.attendance_late_tolerance_minutes},
      after:input,ip:req.ip},db);
    return updated;
  });
  ok(res,{institution:{id:institution.id,name:institution.name,timezone:institution.timezone,
    attendanceDiscrepancyGraceMinutes:institution.attendance_discrepancy_grace_minutes,
    attendanceEarlyToleranceMinutes:institution.attendance_early_tolerance_minutes,
    attendanceLateToleranceMinutes:institution.attendance_late_tolerance_minutes}});
}));

institutionsRouter.put('/me', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(1).max(160),
    timezone: z.string().trim().min(1).max(100).refine((value) => {
      try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }, 'Enter a valid IANA timezone.'),
  }), req.body ?? {});

  const institution = await withTransaction(async (db) => {
    const { rows: [before] } = await db.query(
      'SELECT id, name, timezone FROM institutions WHERE id = $1 FOR UPDATE',
      [req.user.institutionId],
    );
    if (!before) throw new AppError(404, 'NOT_FOUND', 'Institution not found.');
    const duplicate = await db.query(
      'SELECT 1 FROM institutions WHERE lower(name) = lower($1) AND id <> $2',
      [input.name, req.user.institutionId],
    );
    if (duplicate.rowCount) throw new AppError(409, 'INSTITUTION_NAME_TAKEN', 'Another institution already uses that name.');
    const { rows: [updated] } = await db.query(
      'UPDATE institutions SET name = $2, timezone = $3 WHERE id = $1 RETURNING id, name, timezone',
      [req.user.institutionId, input.name, input.timezone],
    );
    await recordAudit({
      actorId: req.user.id,
      institutionId: req.user.institutionId,
      action: 'institution.update',
      targetType: 'institution',
      targetId: updated.id,
      before: { name: before.name, timezone: before.timezone },
      after: { name: updated.name, timezone: updated.timezone },
      ip: req.ip,
    }, db);
    return updated;
  });
  ok(res, { institution });
}));
