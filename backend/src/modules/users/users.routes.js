import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../../utils/password.js';
import { USER_WITH_OFFICE_SQL, revokeAllSessions, toPublicUser } from '../auth/auth.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { myTerms } from '../semesters/semesters.service.js';
import { rawUpload, uploadedFile } from '../documents/upload.js';
import { validateUpload } from '../documents/files.js';

const ROLES = ['student', 'supervisor', 'admin'];

const createSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  fullName: z.string().trim().min(1, 'Name is required.').max(120),
  role: z.enum(ROLES),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
  officeId: z.string().uuid().nullish(),
  requiredHours: z.coerce.number().min(0.5, 'Minimum 0.5 hours').max(744, 'Maximum 744 hours').nullish(),
});

const updateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    requiredHours: z.coerce.number().min(0.5, 'Minimum 0.5 hours').max(744, 'Maximum 744 hours').nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change.');

const assignmentSchema = z.object({ officeId: z.string().uuid().nullable() });

// Fields safe to store in the audit log (never the password hash).
const auditView = (u) => ({
  email: u.email,
  fullName: u.fullName,
  yearLevel: u.yearLevel,
  course: u.course,
  role: u.role,
  status: u.status,
  requiredHours: u.requiredHours,
  officeId: u.office?.id ?? null,
});

const fetchUser = async (id, db = { query }, institutionId = null) => {
  const { rows } = await db.query(
    `${USER_WITH_OFFICE_SQL} WHERE u.id = $1 AND ($2::uuid IS NULL OR u.institution_id = $2)`,
    [id, institutionId],
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
};

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.post('/me/photo',requireRole('student','supervisor'),rawUpload,asyncHandler(async(req,res)=>{
  const {buffer,rawName}=uploadedFile(req);
  const file=validateUpload(buffer,rawName,2*1024*1024);
  if(!['image/png','image/jpeg'].includes(file.mime)) throw new AppError(400,'BAD_FILE_TYPE','Choose a PNG or JPEG photo.');
  await withTransaction(async db=>{
    await db.query(`UPDATE users SET profile_photo=$2,profile_photo_mime=$3,profile_photo_updated_at=clock_timestamp()
      WHERE id=$1 AND institution_id=$4 AND role IN ('student','supervisor')`,[req.user.id,buffer,file.mime,req.user.institutionId]);
    await recordAudit({actorId:req.user.id,institutionId:req.user.institutionId,action:'user.photo_updated',targetType:'user',targetId:req.user.id,after:{mime:file.mime,size:file.size},ip:req.ip},db);
  });
  ok(res,{user:await fetchUser(req.user.id,{query},req.user.institutionId)});
}));
usersRouter.delete('/me/photo',requireRole('student','supervisor'),asyncHandler(async(req,res)=>{
  await withTransaction(async db=>{
    await db.query('UPDATE users SET profile_photo=NULL,profile_photo_mime=NULL,profile_photo_updated_at=NULL WHERE id=$1 AND institution_id=$2',[req.user.id,req.user.institutionId]);
    await recordAudit({actorId:req.user.id,institutionId:req.user.institutionId,action:'user.photo_removed',targetType:'user',targetId:req.user.id,ip:req.ip},db);
  });
  ok(res,{user:await fetchUser(req.user.id,{query},req.user.institutionId)});
}));
usersRouter.get('/me/teammates',requireRole('student'),asyncHandler(async(req,res)=>{
  const page=parse(z.coerce.number().int().min(1).max(100000).default(1),req.query.page);
  const limit=parse(z.coerce.number().int().min(1).max(20).default(12),req.query.limit);
  const search=parse(z.string().trim().max(100).default(''),req.query.search);
  const {rows}=await query(`SELECT DISTINCT u.id,u.full_name,u.year_level,u.course,u.profile_photo_updated_at,o.id AS office_id,o.name AS office_name,
      count(*) OVER()::int AS total
    FROM users u JOIN duty_assignments d ON d.user_id=u.id AND d.ends_on IS NULL
    JOIN offices o ON o.id=d.office_id AND o.institution_id=$2
    WHERE u.institution_id=$2 AND u.role='student' AND u.status='active' AND u.id<>$1
      AND EXISTS(SELECT 1 FROM duty_assignments mine WHERE mine.user_id=$1 AND mine.ends_on IS NULL AND mine.office_id=d.office_id)
      AND (u.full_name ILIKE $3 OR u.course ILIKE $3)
    ORDER BY u.full_name,u.id LIMIT $4 OFFSET $5`,[req.user.id,req.user.institutionId,`%${search}%`,limit,(page-1)*limit]);
  ok(res,{items:rows.map(row=>({id:row.id,fullName:row.full_name,yearLevel:row.year_level,course:row.course,
    photoUrl:row.profile_photo_updated_at?`/users/${row.id}/photo?v=${new Date(row.profile_photo_updated_at).getTime()}`:null,
    office:{id:row.office_id,name:row.office_name}})),total:rows[0]?.total??0,page,limit});
}));
usersRouter.get('/:id/photo',asyncHandler(async(req,res)=>{
  const target=await fetchUser(parseId(req.params.id),{query},req.user.institutionId);
  const sameOfficeStudent=target?.role==='student'&&target.status==='active'&&target.office?.id&&target.office.id===req.user.office?.id;
  const allowed=target&&(target.id===req.user.id||req.user.role==='admin'||(req.user.role==='supervisor'&&sameOfficeStudent)||(req.user.role==='student'&&sameOfficeStudent));
  if(!allowed) throw new AppError(404,'NOT_FOUND','Profile photo not found.');
  if(!target.photoUrl) throw new AppError(404,'NOT_FOUND','Profile photo not found.');
  const etag=`"profile-photo-${target.id}-${target.photoUrl.split('v=')[1]}"`;
  res.set({'Cache-Control':'private, no-cache','ETag':etag,'X-Content-Type-Options':'nosniff'});
  if(req.get('if-none-match')===etag) return res.status(304).end();
  const {rows:[photo]}=await query('SELECT profile_photo,profile_photo_mime FROM users WHERE id=$1 AND institution_id=$2',[target.id,req.user.institutionId]);
  if(!photo?.profile_photo) throw new AppError(404,'NOT_FOUND','Profile photo not found.');
  res.set({'Content-Type':photo.profile_photo_mime}).send(photo.profile_photo);
}));

usersRouter.patch('/me/profile',requireRole('student'),asyncHandler(async(req,res)=>{
  const input=parse(z.object({fullName:z.string().trim().min(1).max(120),yearLevel:z.number().int().min(1).max(8).nullable(),
    course:z.string().trim().min(1).max(160).nullable()}).strict(),req.body??{});
  const updated=await withTransaction(async db=>{
    const before=await fetchUser(req.user.id,db,req.user.institutionId);
    const result=await db.query(`UPDATE users SET full_name=$2,year_level=$3,course=$4
      WHERE id=$1 AND institution_id=$5 AND role='student' RETURNING id`,[req.user.id,input.fullName,input.yearLevel,input.course,req.user.institutionId]);
    if(!result.rowCount) throw new AppError(403,'FORBIDDEN','Only Student Assistants can edit their profile here.');
    const after=await fetchUser(req.user.id,db,req.user.institutionId);
    await recordAudit({actorId:req.user.id,institutionId:req.user.institutionId,action:'user.profile_updated',targetType:'user',targetId:req.user.id,
      before:auditView(before),after:auditView(after),ip:req.ip},db);
    return after;
  });
  ok(res,{user:updated});
}));

// List users: admin only.
usersRouter.get('/', requireRole('admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(`${USER_WITH_OFFICE_SQL} WHERE u.institution_id = $1 ORDER BY u.role, u.full_name`, [_req.user.institutionId]);
  ok(res, { users: rows.map(toPublicUser) });
}));

usersRouter.get('/:id/student-overview',requireRole('admin'),asyncHandler(async(req,res)=>{
  const student=await fetchUser(parseId(req.params.id),{query},req.user.institutionId);
  if(!student || student.role!=='student') throw new AppError(404,'NOT_FOUND','Student Assistant not found.');
  const terms=await myTerms(student);
  const {rows}=await query(`SELECT d.id,d.month,d.status,r.snapshot->'totals'->>'recordedHours' AS recorded_hours,
      CASE WHEN d.status='approved' THEN d.verified_seconds+COALESCE((SELECT sum(a.verified_delta_seconds)
        FROM attendance_adjustments a WHERE a.student_id=d.user_id AND a.dtr_month=d.month),0) ELSE NULL END AS verified_seconds
    FROM monthly_dtrs d JOIN users u ON u.id=d.user_id JOIN dtr_revisions r ON r.dtr_id=d.id AND r.revision_no=d.current_revision
    WHERE d.user_id=$1 AND u.institution_id=$2 ORDER BY d.month DESC LIMIT 12`,[student.id,req.user.institutionId]);
  ok(res,{student,terms,dtrs:rows.map(r=>({id:r.id,month:r.month,status:r.status,recordedHours:Number(r.recorded_hours??0),
    verifiedHours:r.verified_seconds==null?null:Math.round(Number(r.verified_seconds)/36)/100}))});
}));

// Create account: admin only. Admin sets an initial password.
usersRouter.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parse(createSchema, req.body ?? {});
  if (input.officeId && input.role === 'admin') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Administrators are not assigned to an office.');
  }
  const passwordHash = await hashPassword(input.password);

  const created = await withTransaction(async (db) => {
    const dup = await db.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
    if (dup.rowCount) throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');

    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, required_hours, institution_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [input.email, passwordHash, input.fullName, input.role, input.role === 'student' ? (input.requiredHours ?? null) : null, req.user.institutionId],
    );
    if (input.officeId) {
      const office = await db.query('SELECT 1 FROM offices WHERE id = $1 AND is_active AND institution_id = $2', [input.officeId, req.user.institutionId]);
      if (!office.rowCount) throw new AppError(400, 'VALIDATION_ERROR', 'Office not found.', { officeId: 'Office not found.' });
      await db.query('INSERT INTO duty_assignments (user_id, office_id) VALUES ($1, $2)', [rows[0].id, input.officeId]);
    }
    const user = await fetchUser(rows[0].id, db);
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'user.create', targetType: 'user', targetId: user.id, after: auditView(user), ip: req.ip }, db);
    return user;
  });
  ok(res, { user: created }, 201);
}));

// Read one user: admin, or the user themself. Changing the id in the URL to
// someone else's id returns 403 for everyone else.
usersRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== id) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  }
  const user = await fetchUser(id, { query }, req.user.role === 'admin' ? req.user.institutionId : null);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  ok(res, { user });
}));

// Change name / role / status: admin only.
usersRouter.patch('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const changes = parse(updateSchema, req.body ?? {});

  // Stop an admin from locking everyone out by demoting or disabling themselves.
  if (id === req.user.id && (changes.role && changes.role !== 'admin' || changes.status === 'disabled')) {
    throw new AppError(400, 'SELF_LOCKOUT', 'You cannot demote or disable your own account.');
  }

  const updated = await withTransaction(async (db) => {
    const before = await fetchUser(id, db, req.user.institutionId);
    if (!before) throw new AppError(404, 'NOT_FOUND', 'User not found.');

    if (changes.role === 'admin' && before.office) {
      throw new AppError(400, 'VALIDATION_ERROR', 'End the office assignment before making this user an administrator.');
    }
    await db.query(
      `UPDATE users SET full_name = COALESCE($2, full_name),
                        role = COALESCE($3::user_role, role),
                        status = COALESCE($4::user_status, status),
                        required_hours = CASE WHEN $5::boolean THEN $6::numeric ELSE required_hours END
       WHERE id = $1`,
      [
        id,
        changes.fullName ?? null,
        changes.role ?? null,
        changes.status ?? null,
        'requiredHours' in changes,
        changes.requiredHours ?? null,
      ],
    );
    if (changes.status === 'disabled') await revokeAllSessions(id, db);

    const after = await fetchUser(id, db);
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'user.update', targetType: 'user', targetId: id, before: auditView(before), after: auditView(after), ip: req.ip }, db);
    return after;
  });
  ok(res, { user: updated });
}));

// Assign (or unassign with officeId: null) a user's current office: admin only.
// The old assignment is ended, not deleted, so history is kept.
usersRouter.put('/:id/assignment', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { officeId } = parse(assignmentSchema, req.body ?? {});

  const updated = await withTransaction(async (db) => {
    const before = await fetchUser(id, db, req.user.institutionId);
    if (!before) throw new AppError(404, 'NOT_FOUND', 'User not found.');
    if (before.role === 'admin') throw new AppError(400, 'VALIDATION_ERROR', 'Administrators are not assigned to an office.');
    if (officeId) {
      const office = await db.query(
        `SELECT 1 FROM offices WHERE id = $1 AND is_active
         AND institution_id = (SELECT institution_id FROM users WHERE id = $2)`,
        [officeId, id],
      );
      if (!office.rowCount) throw new AppError(404, 'NOT_FOUND', 'Office not found.');
    }
    await db.query('UPDATE duty_assignments SET ends_on = CURRENT_DATE WHERE user_id = $1 AND ends_on IS NULL', [id]);
    if (officeId) await db.query('INSERT INTO duty_assignments (user_id, office_id) VALUES ($1, $2)', [id, officeId]);

    const after = await fetchUser(id, db);
    await recordAudit({ actorId: req.user.id, institutionId: req.user.institutionId, action: 'user.assignment_change', targetType: 'user', targetId: id, before: auditView(before), after: auditView(after), ip: req.ip }, db);
    return after;
  });
  ok(res, { user: updated });
}));
