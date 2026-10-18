import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../../utils/password.js';
import { USER_WITH_OFFICE_SQL, revokeAllSessions, toPublicUser } from '../auth/auth.service.js';
import { recordAudit } from '../audit/audit.service.js';

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

// List users: admin only.
usersRouter.get('/', requireRole('admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(`${USER_WITH_OFFICE_SQL} WHERE u.institution_id = $1 ORDER BY u.role, u.full_name`, [_req.user.institutionId]);
  ok(res, { users: rows.map(toPublicUser) });
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
    await recordAudit({ actorId: req.user.id, action: 'user.create', targetType: 'user', targetId: user.id, after: auditView(user), ip: req.ip }, db);
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
    await recordAudit({ actorId: req.user.id, action: 'user.update', targetType: 'user', targetId: id, before: auditView(before), after: auditView(after), ip: req.ip }, db);
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
    await recordAudit({ actorId: req.user.id, action: 'user.assignment_change', targetType: 'user', targetId: id, before: auditView(before), after: auditView(after), ip: req.ip }, db);
    return after;
  });
  ok(res, { user: updated });
}));
