import { query } from '../../db/pool.js';

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

// Append one row to the audit log.
// Pass a transaction `db` client to make the audit row commit or roll back
// together with the change it describes.
// NEVER put passwords, hashes, or session tokens in before/after.
export async function recordAudit(
  {
    actorId = null,
    institutionId = null,
    action,
    targetType = null,
    targetId = null,
    before = null,
    after = null,
    ip = null,
  },
  db = { query },
) {
  let resolvedInstitutionId = institutionId;
  if (!resolvedInstitutionId && actorId) {
    try {
      const userRes = await db.query('SELECT institution_id FROM users WHERE id = $1', [actorId]);
      resolvedInstitutionId = userRes.rows[0]?.institution_id ?? null;
    } catch {
      // If db query fails during error rollback or similar, keep null
    }
  }

  await db.query(
    `INSERT INTO audit_logs
       (actor_id, institution_id, action, target_type, target_id, before_data, after_data, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorId, resolvedInstitutionId, action, targetType, targetId,
      before ? JSON.stringify(before) : null,
      after  ? JSON.stringify(after)  : null,
      ip],
  );
}

// ---------------------------------------------------------------------------
// Read helpers — used only by audit.routes.js (admin-only)
// ---------------------------------------------------------------------------

const ACTION_CATEGORIES = {
  auth:        ['auth.login', 'auth.logout', 'auth.login_failed', 'auth.login_rejected', 'auth.account_locked', 'auth.password_reset'],
  users:       ['user.create', 'user.update', 'user.assignment_change'],
  attendance:  ['attendance.time_in', 'attendance.time_out', 'attendance.correction',
    'attendance_discrepancy.detected','attendance_discrepancy.explanation_submitted','attendance_discrepancy.correction_requested',
    'attendance_discrepancy.review_started','attendance_discrepancy.clarification_requested','attendance_discrepancy.correction_approved',
    'attendance_discrepancy.correction_rejected','attendance_discrepancy.resolved','attendance_discrepancy.adjustment_applied',
    'historical_duty_credit.submitted','historical_duty_credit.verified','historical_duty_credit.approved','historical_duty_credit.rejected'],
  dtr:         ['dtr.generate', 'dtr.submit', 'dtr.approve', 'dtr.return', 'dtr.policy_update'],
  absences:    ['absence.submit', 'absence.acknowledge', 'absence.reviewed', 'absence.needs_follow_up', 'absence.student_responded', 'absence.document_added', 'absence.receipt_recorded'],
  cases:       ['case.open', 'case.update', 'case.close', 'case.document_added'],
  qr:          ['qr.generate', 'qr.regenerate', 'qr.revoke'],
  institution: ['institution.update'],
  attendance_policy: ['institution.attendance_policy_update'],
  settings:    ['dtr.policy_update', 'duty_requirement.create', 'duty_requirement.update', 'duty_requirement.delete',
    'semester_transition.policy_updated', 'semester_transition.previewed', 'semester_transition.finalized',
    'semester_transition.cancelled', 'semester_transition.finalize_failed'],
};

const VALID_CATEGORIES = Object.keys(ACTION_CATEGORIES);

// Human-readable action labels
const ACTION_LABELS = {
  'auth.login':                   'Signed in',
  'auth.logout':                  'Signed out',
  'auth.login_failed':            'Failed login attempt',
  'auth.login_rejected':          'Login rejected',
  'auth.account_locked':          'Account locked',
  'auth.password_reset':          'Password reset',
  'user.create':                  'User created',
  'user.update':                  'User updated',
  'user.assignment_change':       'Office assignment changed',
  'attendance.time_in':           'Clocked in',
  'attendance.time_out':          'Clocked out',
  'attendance.correction':        'Attendance corrected',
  'attendance_discrepancy.detected': 'Attendance discrepancy detected',
  'attendance_discrepancy.explanation_submitted': 'Attendance explanation submitted',
  'attendance_discrepancy.correction_requested': 'Attendance correction requested',
  'attendance_discrepancy.review_started': 'Attendance discrepancy review started',
  'attendance_discrepancy.clarification_requested': 'Attendance clarification requested',
  'attendance_discrepancy.correction_approved': 'Attendance correction approved',
  'attendance_discrepancy.correction_rejected': 'Attendance correction rejected',
  'attendance_discrepancy.resolved': 'Attendance discrepancy resolved',
  'attendance_discrepancy.adjustment_applied': 'Approved attendance adjustment applied',
  'historical_duty_credit.submitted': 'Historical duty credit submitted for review',
  'historical_duty_credit.verified': 'Historical duty credit verified by supervisor',
  'historical_duty_credit.approved': 'Historical duty credit approved by administrator',
  'historical_duty_credit.rejected': 'Historical duty credit rejected by administrator',
  'institution.attendance_policy_update': 'Attendance discrepancy policy updated',
  'dtr.generate':                 'DTR generated',
  'dtr.submit':                   'DTR submitted',
  'dtr.approve':                  'DTR approved',
  'dtr.return':                   'DTR returned for correction',
  'dtr.policy_update':            'DTR policy updated',
  'absence.submit':               'Absence notice submitted',
  'absence.acknowledge':          'Absence acknowledged',
  'absence.reviewed':             'Absence reviewed',
  'absence.needs_follow_up':      'Absence needs follow-up',
  'absence.student_responded':    'Student responded to absence',
  'absence.document_added':       'Absence document added',
  'absence.receipt_recorded':     'Absence receipt recorded',
  'case.open':                    'Case opened',
  'case.update':                  'Case updated',
  'case.close':                   'Case closed',
  'case.document_added':          'Case document added',
  'qr.generate':                  'QR code generated',
  'qr.regenerate':                'QR code regenerated',
  'qr.revoke':                    'QR code revoked',
  'institution.update':           'Institution settings updated',
  'duty_requirement.create':      'Duty requirement created',
  'duty_requirement.update':      'Duty requirement updated',
  'duty_requirement.delete':      'Duty requirement deleted',
  'semester_transition.policy_updated': 'Semester transition policy updated',
  'semester_transition.previewed': 'Semester transition preview generated',
  'semester_transition.finalized': 'Semester transition finalized',
  'semester_transition.cancelled': 'Semester transition preview cancelled',
  'semester_transition.finalize_failed': 'Semester transition finalization blocked',
};

export function labelForAction(action) {
  return ACTION_LABELS[action] ?? action;
}

// Derive the category for a given action string.
export function categoryForAction(action) {
  for (const [cat, actions] of Object.entries(ACTION_CATEGORIES)) {
    if (actions.includes(action)) return cat;
  }
  return 'other';
}

/**
 * List paginated audit events for one institution (admin view).
 * All filters are optional; all params are validated/sanitised by the route.
 *
 * @param {object} opts
 * @param {string}  opts.institutionId  — required; scopes the query
 * @param {string=} opts.search         — free-text: matches actor name, email, action, target_id
 * @param {string=} opts.category       — one of VALID_CATEGORIES
 * @param {string=} opts.action         — exact action string
 * @param {string=} opts.actorId        — uuid: filter to one actor
 * @param {string=} opts.targetType     — exact target_type string
 * @param {string=} opts.dateFrom       — ISO date string (inclusive)
 * @param {string=} opts.dateTo         — ISO date string (inclusive, end-of-day)
 * @param {number}  opts.page           — 1-based page number
 * @param {number}  opts.limit          — rows per page (max 100)
 * @returns {{ rows: object[], total: number }}
 */
export async function listAuditEvents({
  institutionId,
  search,
  category,
  action: filterAction,
  actorId,
  role,
  targetType,
  dateFrom,
  dateTo,
  page = 1,
  limit = 50,
}, db = { query }) {
  const params = [institutionId];
  const conditions = ['(al.institution_id = $1 OR (al.institution_id IS NULL AND u.institution_id = $1))'];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const n = params.length;
    conditions.push(
      `(lower(u.full_name) LIKE $${n} OR lower(u.email) LIKE $${n} OR lower(al.action) LIKE $${n} OR lower(al.target_id::text) LIKE $${n})`,
    );
  }

  if (role) {
    if (role === 'system') {
      conditions.push('al.actor_id IS NULL');
    } else {
      params.push(role);
      conditions.push(`u.role = $${params.length}::user_role`);
    }
  }

  if (category && VALID_CATEGORIES.includes(category)) {
    const catActions = ACTION_CATEGORIES[category];
    params.push(catActions);
    conditions.push(`al.action = ANY($${params.length}::text[])`);
  }

  if (filterAction) {
    params.push(filterAction);
    conditions.push(`al.action = $${params.length}`);
  }

  if (actorId) {
    params.push(actorId);
    conditions.push(`al.actor_id = $${params.length}`);
  }

  if (targetType) {
    params.push(targetType);
    conditions.push(`al.target_type = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`al.created_at >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    // end of day
    conditions.push(`al.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const safeLimit  = Math.min(Math.max(Number(limit)  || 50,  1), 100);
  const safePage   = Math.max(Number(page)  || 1,  1);
  const offset     = (safePage - 1) * safeLimit;

  const countResult = await db.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}`,
    params,
  );

  params.push(safeLimit, offset);
  const dataResult = await db.query(
    `SELECT
       al.id,
       al.action,
       al.target_type,
       al.target_id,
       al.before_data,
       al.after_data,
       al.ip_address,
       al.created_at,
       al.actor_id,
       u.full_name  AS actor_name,
       u.email      AS actor_email,
       u.role       AS actor_role
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: dataResult.rows.map(mapRow),
    total: Number(countResult.rows[0].total),
    page: safePage,
    limit: safeLimit,
  };
}

/**
 * Summary stats for the admin dashboard cards:
 *  - total events today
 *  - total events this month
 *  - auth failures today
 *  - unique actors today
 */
export async function auditStats(institutionId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)                                                    AS total_today,
       COUNT(*) FILTER (WHERE al.created_at >= date_trunc('month', now())) AS total_month,
       COUNT(*) FILTER (
         WHERE al.created_at >= now() - interval '24 hours'
           AND al.action IN ('auth.login_failed', 'auth.login_rejected', 'auth.account_locked')
       )                                                           AS auth_failures_today,
       COUNT(DISTINCT al.actor_id) FILTER (
         WHERE al.created_at >= now() - interval '24 hours'
       )                                                           AS unique_actors_today
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE (al.institution_id = $1 OR (al.institution_id IS NULL AND u.institution_id = $1))
       AND al.created_at >= date_trunc('day', now())`,
    [institutionId],
  );
  const r = rows[0];
  return {
    totalToday:        Number(r.total_today),
    totalMonth:        Number(r.total_month),
    authFailuresToday: Number(r.auth_failures_today),
    uniqueActorsToday: Number(r.unique_actors_today),
  };
}

function mapRow(r) {
  return {
    id:          r.id,
    action:      r.action,
    label:       labelForAction(r.action),
    category:    categoryForAction(r.action),
    targetType:  r.target_type,
    targetId:    r.target_id,
    beforeData:  r.before_data,
    afterData:   r.after_data,
    ipAddress:   r.ip_address,
    createdAt:   r.created_at,
    actor: r.actor_id ? {
      id:       r.actor_id,
      name:     r.actor_name,
      email:    r.actor_email,
      role:     r.actor_role,
    } : null,
  };
}
