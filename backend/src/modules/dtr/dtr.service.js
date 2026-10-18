import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { createNotification, notifyOfficeSupervisors } from '../notifications/notifications.service.js';
import { monthHistory } from '../attendance/attendance.service.js';
import { buildSnapshot, canTransition, endedMonths, isMonthEnded, secondsToHours } from './dtr.rules.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');

async function dbNow(db = { query }) {
  const { rows } = await db.query('SELECT now() AS now');
  return rows[0].now;
}

// ---------------------------------------------------------------- policy
export async function getPolicy(institutionId) {
  const { rows } = await query(
    `SELECT p.required_monthly_hours, p.review_sla_hours, p.updated_at, u.full_name AS updated_by_name
     FROM institution_dtr_policies p LEFT JOIN users u ON u.id = p.updated_by
     WHERE p.institution_id = $1`,
    [institutionId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Institution policy not found.');
  return {
    requiredMonthlyHours: Number(rows[0].required_monthly_hours),
    reviewSlaHours: rows[0].review_sla_hours,
    updatedAt: rows[0].updated_at,
    updatedBy: rows[0].updated_by_name,
    timezone: env.timezone,
    requiredHoursConfirmed: false,
    officialTemplate: false,
  };
}

export async function setRequiredHours({ actor, hours, reviewSlaHours, ip }) {
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      'SELECT required_monthly_hours, review_sla_hours FROM institution_dtr_policies WHERE institution_id = $1 FOR UPDATE',
      [actor.institutionId],
    );
    const nextReviewSlaHours = reviewSlaHours === undefined ? rows[0].review_sla_hours : reviewSlaHours;
    await db.query(
      `UPDATE institution_dtr_policies SET required_monthly_hours = $2, review_sla_hours = $3, updated_by = $4, updated_at = now()
       WHERE institution_id = $1`,
      [actor.institutionId, hours, nextReviewSlaHours, actor.id],
    );
    await recordAudit({
      actorId: actor.id,
      action: Number(rows[0].required_monthly_hours) !== hours
        ? 'policy.required_hours_changed'
        : rows[0].review_sla_hours !== nextReviewSlaHours ? 'policy.review_sla_changed' : 'policy.settings_saved',
      targetType: 'institution_dtr_policy',
      targetId: actor.institutionId,
      before: { requiredMonthlyHours: Number(rows[0].required_monthly_hours), reviewSlaHours: rows[0].review_sla_hours },
      after: { requiredMonthlyHours: hours, reviewSlaHours: nextReviewSlaHours }, ip,
    }, db);
  });
  return getPolicy(actor.institutionId);
}

// --------------------------------------------------------------- mapping
const mapDtr = (r) => ({
  id: r.id,
  month: r.month,
  status: r.status,
  currentRevision: r.current_revision,
  student: { id: r.user_id, fullName: r.student_name, email: r.student_email },
  office: { id: r.office_id, code: r.office_code, name: r.office_name },
  // Verified time exists ONLY for approved DTRs.
  verifiedHours: r.status === 'approved' ? secondsToHours(r.verified_seconds) : null,
  verifiedRevision: r.status === 'approved' ? r.verified_revision : null,
  decidedAt: r.decided_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  // Summary of the current revision (present when the query joined it).
  recordedHours: r.snap_totals ? r.snap_totals.recordedHours : undefined,
  requiredHours: r.snap_totals ? r.snap_totals.requiredHours : undefined,
  incompleteCount: r.snap_totals ? r.snap_totals.incompleteCount : undefined,
});

const DTR_SELECT = `
  SELECT d.*, s.full_name AS student_name, s.email AS student_email,
         o.code AS office_code, o.name AS office_name, rv.snapshot -> 'totals' AS snap_totals
  FROM monthly_dtrs d
  JOIN users s ON s.id = d.user_id
  JOIN offices o ON o.id = d.office_id
  JOIN dtr_revisions rv ON rv.dtr_id = d.id AND rv.revision_no = d.current_revision`;

// ---------------------------------------------------------------- access
// student: only their own DTRs. supervisor: only DTRs of THEIR office. admin: read-only, any.
// Unknown ids and other people's ids give the same answer, so ids can't be probed.
function assertCanView(user, dtr) {
  if (!dtr) throw forbidden();
  if (user.role === 'admin' && dtr.institution_id === user.institutionId) return;
  if (user.role === 'student' && dtr.user_id === user.id) return;
  // Drafts are the student's private work: supervisors only see DTRs that were submitted.
  if (user.role === 'supervisor' && user.office && dtr.office_id === user.office.id && dtr.user_id !== user.id && dtr.status !== 'draft') return;
  throw forbidden();
}

async function loadRow(id, db = { query }, lock = false) {
  const { rows } = await db.query(
    `SELECT d.*, u.institution_id FROM monthly_dtrs d JOIN users u ON u.id = d.user_id
     WHERE d.id = $1${lock ? ' FOR UPDATE OF d' : ''}`,
    [id],
  );
  return rows[0];
}

// ----------------------------------------------------------- eligibility
async function requireMonthEnded(month, now) {
  if (!isMonthEnded(month, now, env.timezone)) {
    throw new AppError(409, 'MONTH_NOT_ENDED',
      `A DTR can only be generated after the month has ended (${env.timezone}). ${month} has not ended yet.`);
  }
}

async function liveSnapshot(user, month, now) {
  await requireMonthEnded(month, now);
  if (!user.office) throw new AppError(403, 'NOT_ASSIGNED', 'You are not assigned to an office. Ask an administrator.');
  const [history, policy] = await Promise.all([monthHistory(user.id, month), getPolicy(user.institutionId)]);
  const effectiveRequiredHours = user.requiredHours != null ? Number(user.requiredHours) : policy.requiredMonthlyHours;
  return buildSnapshot({
    history, student: user, office: user.office, requiredHours: effectiveRequiredHours, generatedAt: now,
  });
}

// Read-only preview: nothing is stored.
export async function preview(user, month) {
  return liveSnapshot(user, month, await dbNow());
}

// Last 12 ended months with the DTR status of each, plus my verified total.
export async function myOverview(user) {
  const now = await dbNow();
  const { rows } = await query(`${DTR_SELECT} WHERE d.user_id = $1`, [user.id]);
  const byMonth = new Map(rows.map((r) => [r.month, mapDtr(r)]));
  const verified = rows.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.verified_seconds, 0);
  const policy = await getPolicy(user.institutionId);
  const effectivePolicy = {
    ...policy,
    requiredMonthlyHours: user.requiredHours != null ? Number(user.requiredHours) : policy.requiredMonthlyHours,
  };
  return {
    timezone: env.timezone,
    policy: effectivePolicy,
    months: endedMonths(now, env.timezone).map((month) => ({ month, dtr: byMonth.get(month) ?? null })),
    verifiedHoursTotal: secondsToHours(verified),
    approvedCount: rows.filter((r) => r.status === 'approved').length,
  };
}

// -------------------------------------------------------------- generate
// Creates the month's DTR (draft), or - while it is a draft or was returned - adds a
// NEW revision from the latest attendance. Earlier revisions are kept. Submitted,
// under-review and approved DTRs are locked.
export async function generate({ user, month, ip }) {
  const now = await dbNow();
  const snapshot = await liveSnapshot(user, month, now);

  return withTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dtr:${user.id}:${month}`]);
    const { rows } = await db.query('SELECT * FROM monthly_dtrs WHERE user_id = $1 AND month = $2 FOR UPDATE', [user.id, month]);
    const existing = rows[0];
    let id; let revisionNo; let from = null; let action;

    if (!existing) {
      const ins = await db.query(
        `INSERT INTO monthly_dtrs (user_id, office_id, month) VALUES ($1, $2, $3) RETURNING id`,
        [user.id, user.office.id, month],
      );
      id = ins.rows[0].id; revisionNo = 1; action = 'generated';
    } else if (existing.status === 'draft' || existing.status === 'needs_correction') {
      id = existing.id; from = existing.status; revisionNo = existing.current_revision + 1; action = 'regenerated';
      await db.query(
        `UPDATE monthly_dtrs SET status = 'draft', current_revision = $2, office_id = $3 WHERE id = $1`,
        [id, revisionNo, user.office.id],
      );
    } else {
      throw new AppError(409, 'DTR_LOCKED',
        `This DTR is ${existing.status.replace('_', ' ')} and can no longer be regenerated.`);
    }

    await db.query(
      `INSERT INTO dtr_revisions (dtr_id, revision_no, snapshot, generated_by, generated_at) VALUES ($1, $2, $3, $4, $5)`,
      [id, revisionNo, snapshot, user.id, now],
    );
    await db.query(
      `INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id) VALUES ($1, $2, $3, $4, 'draft', $5)`,
      [id, revisionNo, action, from, user.id],
    );
    await recordAudit({
      actorId: user.id, action: `dtr.${action}`, targetType: 'monthly_dtr', targetId: id,
      after: { month, revision: revisionNo, recordedHours: snapshot.totals.recordedHours, incompleteCount: snapshot.totals.incompleteCount }, ip,
    }, db);
    return getDetail({ user, id }, db);
  });
}

// ------------------------------------------------------------------ read
export async function list({ user, status, month }) {
  const where = []; const params = [];
  if (user.role === 'admin') { params.push(user.institutionId); where.push(`s.institution_id = $${params.length}`); }
  if (user.role === 'student') { params.push(user.id); where.push(`d.user_id = $${params.length}`); }
  if (user.role === 'supervisor') {
    if (!user.office) return [];
    params.push(user.office.id); where.push(`d.office_id = $${params.length}`);
    params.push(user.id); where.push(`d.user_id <> $${params.length}`);
    // Drafts are the student's private work; supervisors only see DTRs that were submitted.
    where.push(`d.status <> 'draft'`);
  }
  if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
  if (month) { params.push(month); where.push(`d.month = $${params.length}`); }
  const { rows } = await query(
    `${DTR_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.month DESC, s.full_name`,
    params,
  );
  return rows.map(mapDtr);
}

export async function getDetail({ user, id, revision }, db = { query }) {
  const raw = await loadRow(id, db);
  assertCanView(user, raw);
  const { rows } = await db.query(`${DTR_SELECT} WHERE d.id = $1`, [id]);
  const revs = await db.query(
    `SELECT r.revision_no, r.generated_at, r.snapshot, u.full_name AS generated_by_name
     FROM dtr_revisions r JOIN users u ON u.id = r.generated_by WHERE r.dtr_id = $1 ORDER BY r.revision_no`, [id]);
  const events = await db.query(
    `SELECT e.id, e.revision_no, e.action, e.from_status, e.to_status, e.reason, e.created_at,
            u.id AS actor_id, u.full_name AS actor_name, u.role AS actor_role
     FROM dtr_events e JOIN users u ON u.id = e.actor_id WHERE e.dtr_id = $1 ORDER BY e.id`, [id]);

  const wanted = revision ?? raw.current_revision;
  const chosen = revs.rows.find((r) => r.revision_no === wanted);
  if (!chosen) throw new AppError(404, 'NOT_FOUND', 'That revision does not exist.');

  return {
    ...mapDtr(rows[0]),
    revision: { number: chosen.revision_no, generatedAt: chosen.generated_at, generatedBy: chosen.generated_by_name, snapshot: chosen.snapshot },
    revisions: revs.rows.map((r) => ({
      number: r.revision_no, generatedAt: r.generated_at, generatedBy: r.generated_by_name,
      recordedHours: r.snapshot.totals.recordedHours, incompleteCount: r.snapshot.totals.incompleteCount,
    })),
    history: events.rows.map((e) => ({
      id: Number(e.id), revision: e.revision_no, action: e.action, fromStatus: e.from_status, toStatus: e.to_status,
      reason: e.reason, at: e.created_at, actor: { id: e.actor_id, fullName: e.actor_name, role: e.actor_role },
    })),
    latestReturnReason: [...events.rows].reverse().find((e) => e.action === 'returned')?.reason ?? null,
  };
}

// ------------------------------------------------------------- workflow
// One helper for every status change: lock the row, check who and what state, move,
// log the event, audit. All in one transaction.
async function transition({ user, id, to, action, ip, reason = null, check, extra = {} }) {
  return withTransaction(async (db) => {
    const dtr = await loadRow(id, db, true);
    assertCanView(user, dtr);
    check?.(dtr);
    if (!canTransition(dtr.status, to)) {
      throw new AppError(409, 'INVALID_TRANSITION',
        `A DTR that is "${dtr.status.replace('_', ' ')}" cannot become "${to.replace('_', ' ')}".`);
    }
    const sets = ['status = $2']; const params = [id, to];
    for (const [col, val] of Object.entries(extra)) { params.push(val); sets.push(`${col} = $${params.length}`); }
    if (to !== 'approved') sets.push('verified_seconds = NULL'); // no stale verification on any other state
    await db.query(`UPDATE monthly_dtrs SET ${sets.join(', ')} WHERE id = $1`, params);
    await db.query(
      `INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, dtr.current_revision, action, dtr.status, to, user.id, reason],
    );
    await recordAudit({
      actorId: user.id, action: `dtr.${action}`, targetType: 'monthly_dtr', targetId: id,
      before: { status: dtr.status }, after: { status: to, revision: dtr.current_revision, ...(reason ? { reason } : {}) }, ip,
    }, db);
    if (to === 'submitted') {
      await notifyOfficeSupervisors(db, {
        officeId: dtr.office_id, institutionId: dtr.institution_id, type: 'dtr_submitted',
        title: 'DTR awaiting review', message: `A Student Assistant submitted the ${dtr.month} DTR for review.`,
        relatedType: 'monthly_dtr', relatedId: dtr.id, important: true,
        dedupeKey: `dtr:${dtr.id}:submitted:${dtr.current_revision}`,
      });
    }
    if (to === 'approved' || to === 'needs_correction') {
      await createNotification(db, {
        recipientId: dtr.user_id, institutionId: dtr.institution_id,
        type: to === 'approved' ? 'dtr_approved' : 'dtr_correction',
        title: to === 'approved' ? 'DTR approved' : 'DTR returned for correction',
        message: to === 'approved' ? `Your ${dtr.month} DTR was approved.` : `Your ${dtr.month} DTR needs correction.${reason ? ` ${reason}` : ''}`,
        relatedType: 'monthly_dtr', relatedId: dtr.id, important: true,
        dedupeKey: `dtr:${dtr.id}:${to}:${dtr.current_revision}`,
      });
    }
    return getDetail({ user, id }, db);
  });
}

const ownerOnly = (user) => (dtr) => { if (dtr.user_id !== user.id) throw forbidden(); };

// A supervisor can never act on their own DTR, even if one somehow exists.
const reviewerOnly = (user) => (dtr) => {
  if (dtr.user_id === user.id) throw new AppError(403, 'SELF_REVIEW', 'You cannot review your own DTR.');
  if (user.role !== 'supervisor') throw forbidden();
};

export const submit = ({ user, id, ip }) =>
  transition({ user, id, to: 'submitted', action: 'submitted', ip, check: ownerOnly(user) });

export const startReview = ({ user, id, ip }) =>
  transition({ user, id, to: 'under_review', action: 'review_started', ip, check: reviewerOnly(user) });

export async function approve({ user, id, acknowledgeIncomplete, ip }) {
  return withTransaction(async (db) => {
    const dtr = await loadRow(id, db, true);
    assertCanView(user, dtr);
    reviewerOnly(user)(dtr);
    if (dtr.status === 'under_review') {
      const { rows } = await db.query('SELECT snapshot FROM dtr_revisions WHERE dtr_id = $1 AND revision_no = $2', [id, dtr.current_revision]);
      const totals = rows[0].snapshot.totals;
      // Incomplete attendance is flagged, never silently counted: approving a DTR that has
      // flagged sessions needs an explicit acknowledgement that those sessions are NOT verified.
      if (totals.incompleteCount > 0 && !acknowledgeIncomplete) {
        throw new AppError(409, 'INCOMPLETE_NOT_ACKNOWLEDGED',
          `This DTR has ${totals.incompleteCount} flagged session(s) that are not counted. Confirm that only the counted hours are verified, or return it for correction.`);
      }
      return transitionInside(db, { user, dtr, to: 'approved', action: 'approved', ip,
        extra: { verified_seconds: totals.recordedSeconds, verified_revision: dtr.current_revision, decided_by: user.id, decided_at: new Date() } });
    }
    throw new AppError(409, 'INVALID_TRANSITION', `A DTR that is "${dtr.status.replace('_', ' ')}" cannot become "approved".`);
  });
}

export function returnForCorrection({ user, id, reason, ip }) {
  return transition({
    user, id, to: 'needs_correction', action: 'returned', ip, reason, check: reviewerOnly(user),
    extra: { decided_by: user.id, decided_at: new Date() },
  });
}

// Used by approve(), which needs the revision lookup inside the same transaction.
async function transitionInside(db, { user, dtr, to, action, ip, extra }) {
  const sets = ['status = $2']; const params = [dtr.id, to];
  for (const [col, val] of Object.entries(extra)) { params.push(val); sets.push(`${col} = $${params.length}`); }
  await db.query(`UPDATE monthly_dtrs SET ${sets.join(', ')} WHERE id = $1`, params);
  await db.query(
    `INSERT INTO dtr_events (dtr_id, revision_no, action, from_status, to_status, actor_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [dtr.id, dtr.current_revision, action, dtr.status, to, user.id],
  );
  await recordAudit({
    actorId: user.id, action: `dtr.${action}`, targetType: 'monthly_dtr', targetId: dtr.id,
    before: { status: dtr.status }, after: { status: to, revision: dtr.current_revision, verifiedSeconds: extra.verified_seconds }, ip,
  }, db);
  if (to === 'approved') {
    await createNotification(db, {
      recipientId: dtr.user_id, institutionId: dtr.institution_id, type: 'dtr_approved',
      title: 'DTR approved', message: `Your ${dtr.month} DTR was approved.`,
      relatedType: 'monthly_dtr', relatedId: dtr.id, important: true,
      dedupeKey: `dtr:${dtr.id}:approved:${dtr.current_revision}`,
    });
  }
  return getDetail({ user, id: dtr.id }, db);
}

// --------------------------------------------------------------- summary
// Counts for dashboards.
export async function reviewQueueCounts(user) {
  if (!user.office) return { submitted: 0, underReview: 0 };
  const { rows } = await query(
    `SELECT status, count(*)::int AS n FROM monthly_dtrs
     WHERE office_id = $1 AND user_id <> $2 AND status IN ('submitted', 'under_review') GROUP BY status`,
    [user.office.id, user.id],
  );
  const n = (s) => rows.find((r) => r.status === s)?.n ?? 0;
  return { submitted: n('submitted'), underReview: n('under_review') };
}
