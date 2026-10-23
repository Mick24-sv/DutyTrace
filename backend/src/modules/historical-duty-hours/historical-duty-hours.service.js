import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { createNotification } from '../notifications/notifications.service.js';
import { localDateKey } from '../attendance/calc.js';

const fail = (status, code, message) => new AppError(status, code, message);
const forbidden = () => fail(403, 'FORBIDDEN', 'You do not have permission to manage historical duty hours.');
const monthStart = (month) => `${month}-01`;
const monthEnd = (month) => {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};
const roundHours = (value) => Math.round(Number(value || 0) * 100) / 100;

function mapCredit(row) {
  return {
    id: row.id, termId: row.term_id, academicYear: row.academic_year, semester: row.semester,
    studentId: row.student_id, studentName: row.student_name, officeId: row.office_id,
    officeName: row.office_name, month: row.credit_month, granularity: row.granularity,
    workDate: row.work_date, hours: Number(row.hours), verificationSource: row.verification_source,
    verificationReference: row.verification_reference, reason: row.reason, exceptional: row.exceptional,
    status: row.status, createdBy: row.created_by_name, reviewedBy: row.reviewed_by_name,
    reviewNote: row.review_note, amendsId: row.amends_id, createdAt: row.created_at,
  };
}

const SELECT_CREDIT = `SELECT c.*,t.academic_year,t.semester,u.full_name AS student_name,o.name AS office_name,
  creator.full_name AS created_by_name,reviewer.full_name AS reviewed_by_name
  FROM historical_duty_credits c JOIN academic_terms t ON t.id=c.term_id
  JOIN users u ON u.id=c.student_id JOIN offices o ON o.id=c.office_id
  JOIN users creator ON creator.id=c.created_by LEFT JOIN users reviewer ON reviewer.id=c.reviewed_by`;

export async function options(actor) {
  if (actor.role !== 'supervisor' || !actor.office?.id) throw forbidden();
  const { rows: [clock] } = await query('SELECT now() AS now');
  const { rows } = await query(`SELECT DISTINCT t.id,t.academic_year,t.semester,t.starts_on::text,t.ends_on::text,t.finalized_at,t.timezone,
      a.student_id,u.full_name AS student_name
    FROM academic_terms t JOIN semester_requirement_assignments a ON a.term_id=t.id AND a.office_id=$2
    JOIN users u ON u.id=a.student_id AND u.institution_id=t.institution_id AND u.role='student' AND u.status='active'
    WHERE t.institution_id=$1 ORDER BY t.starts_on::text DESC,u.full_name`, [actor.institutionId, actor.office.id]);
  const terms = new Map();
  for (const row of rows) {
    if (!terms.has(row.id)) {
      const today = localDateKey(clock.now, row.timezone);
      const first = new Date(`${String(row.starts_on).slice(0, 7)}-01T12:00:00Z`);
      const last = new Date(`${String(row.ends_on).slice(0, 7)}-01T12:00:00Z`);
      const months = [];
      while (first <= last) {
        const month = first.toISOString().slice(0, 7);
        const start = monthStart(month); const end = monthEnd(month);
        if (month < today.slice(0, 7) && end >= String(row.starts_on).slice(0, 10) && start <= String(row.ends_on).slice(0, 10)) {
          months.push({ month, allowsMonthlyTotal: start >= String(row.starts_on).slice(0, 10) && end <= String(row.ends_on).slice(0, 10) });
        }
        first.setUTCMonth(first.getUTCMonth() + 1);
      }
      terms.set(row.id, { id: row.id, academicYear: row.academic_year, semester: row.semester, startsOn: String(row.starts_on).slice(0, 10), endsOn: String(row.ends_on).slice(0, 10), finalized: Boolean(row.finalized_at), months, students: [] });
    }
    const term = terms.get(row.id);
    if (!term.students.some((student) => student.id === row.student_id)) term.students.push({ id: row.student_id, fullName: row.student_name });
  }
  return { terms: [...terms.values()] };
}

export async function listForSupervisor(actor) {
  if (actor.role !== 'supervisor' || !actor.office?.id) throw forbidden();
  const { rows } = await query(`${SELECT_CREDIT} WHERE c.institution_id=$1 AND c.office_id=$2
    ORDER BY c.credit_month DESC,c.created_at DESC LIMIT 250`, [actor.institutionId, actor.office.id]);
  return rows.map(mapCredit);
}

export async function oversight(actor) {
  if (actor.role !== 'admin') throw forbidden();
  const { rows } = await query(`${SELECT_CREDIT} WHERE c.institution_id=$1 AND c.status='pending_admin'
    ORDER BY c.created_at LIMIT 200`, [actor.institutionId]);
  return { pending: rows.map(mapCredit) };
}

async function ensureNoQrAttendance(db, { studentId, month, workDate, timezone }) {
  const fromDate = workDate ?? monthStart(month);
  const toDate = workDate ?? monthEnd(month);
  const { rows } = await db.query(`SELECT EXISTS(
      SELECT 1 FROM attendance_events e WHERE e.user_id=$1
        AND e.recorded_at >= ($2::date::timestamp AT TIME ZONE $4)
        AND e.recorded_at < (($3::date+1)::timestamp AT TIME ZONE $4)
      UNION ALL
      SELECT 1 FROM attendance_adjustments a CROSS JOIN LATERAL jsonb_array_elements(a.effective_events) e
        WHERE a.student_id=$1 AND (e->>'recordedAt')::timestamptz >= ($2::date::timestamp AT TIME ZONE $4)
          AND (e->>'recordedAt')::timestamptz < (($3::date+1)::timestamp AT TIME ZONE $4)
    ) OR ($5::boolean AND EXISTS(SELECT 1 FROM monthly_dtrs d WHERE d.user_id=$1 AND d.month=$6
      AND d.status='approved' AND d.verified_seconds>0)) AS has_qr`, [studentId, fromDate, toDate, timezone, workDate == null, month]);
  if (rows[0]?.has_qr) throw fail(409, 'QR_ATTENDANCE_EXISTS', 'QR attendance exists in this period. Use a date-level credit only for a day without QR attendance, to prevent double-counting.');
}

async function addHistory(db, creditId, actorId, action, details = {}) {
  await db.query('INSERT INTO historical_duty_credit_history(credit_id,actor_id,action,details) VALUES($1,$2,$3,$4::jsonb)',
    [creditId, actorId, action, JSON.stringify(details)]);
}

export async function create({ actor, input, ip }) {
  if (actor.role !== 'supervisor' || !actor.office?.id) throw forbidden();
  return withTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`historical-credit:${input.studentId}:${input.termId}:${input.month}`]);
    const { rows: [assignment] } = await db.query(`SELECT t.*,u.full_name AS student_name,a.office_id
      FROM academic_terms t JOIN semester_requirement_assignments a ON a.term_id=t.id
      JOIN users u ON u.id=a.student_id WHERE t.id=$1 AND t.institution_id=$2 AND a.student_id=$3
        AND a.office_id=$4 AND u.role='student' AND u.status='active'
      ORDER BY a.assigned_at DESC,a.id DESC LIMIT 1`, [input.termId, actor.institutionId, input.studentId, actor.office.id]);
    if (!assignment) throw forbidden();
    const today = localDateKey((await db.query('SELECT now() AS now')).rows[0].now, assignment.timezone);
    if (input.month >= today.slice(0, 7)) throw fail(400, 'MONTH_NOT_ENDED', 'Choose a month that has already ended.');
    if (input.granularity === 'monthly_total' && (monthStart(input.month) < String(assignment.starts_on).slice(0, 10) || monthEnd(input.month) > String(assignment.ends_on).slice(0, 10))) {
      throw fail(400, 'MONTH_OUTSIDE_TERM', 'A monthly total must fall entirely inside the academic term. Use a date-level entry for a partial term month.');
    }
    const workDate = input.granularity === 'daily' ? input.workDate : null;
    if (workDate && (workDate < String(assignment.starts_on).slice(0, 10) || workDate > String(assignment.ends_on).slice(0, 10) || workDate.slice(0, 7) !== input.month)) {
      throw fail(400, 'DATE_OUTSIDE_TERM', 'The selected work date must be within the selected month and academic term.');
    }
    if (!input.amendsId) await ensureNoQrAttendance(db, { studentId: input.studentId, month: input.month, workDate, timezone: assignment.timezone });
    let prior = null;
    if (input.amendsId) {
      const { rows } = await db.query(`SELECT * FROM historical_duty_credits WHERE id=$1 AND institution_id=$2
        AND office_id=$3 AND student_id=$4 AND term_id=$5 AND credit_month=$6 AND status='approved' FOR UPDATE`,
      [input.amendsId, actor.institutionId, actor.office.id, input.studentId, input.termId, input.month]);
      prior = rows[0];
      if (!prior) throw fail(404, 'CREDIT_NOT_FOUND', 'Approved historical credit not found for amendment.');
      if (prior.granularity !== input.granularity || (prior.work_date ? String(prior.work_date).slice(0, 10) : null) !== workDate) {
        throw fail(400, 'AMENDMENT_SCOPE_MISMATCH', 'An amendment must preserve the original month and entry type.');
      }
    }
    const { rows: overlaps } = await db.query(`SELECT 1 FROM historical_duty_credits c
      WHERE c.student_id=$1 AND c.term_id=$2 AND c.credit_month=$3 AND c.status IN ('approved','pending_admin')
        AND c.id IS DISTINCT FROM $4::uuid AND (
          $5='monthly_total' OR c.granularity='monthly_total' OR c.work_date=$6::date
        ) LIMIT 1`, [input.studentId, input.termId, input.month, input.amendsId ?? null, input.granularity, workDate]);
    if (overlaps.length) throw fail(409, 'HISTORICAL_CREDIT_OVERLAP', 'A historical credit already covers this month or date. Amend the existing approved credit instead of adding overlapping hours.');
    const requiresAdmin = input.exceptional || Boolean(prior) || Boolean(assignment.finalized_at);
    const status = requiresAdmin ? 'pending_admin' : 'approved';
    const { rows: [credit] } = await db.query(`INSERT INTO historical_duty_credits
      (institution_id,term_id,student_id,office_id,credit_month,granularity,work_date,hours,verification_source,verification_reference,reason,
       exceptional,status,created_by,reviewed_by,reviewed_at,amends_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $15::uuid IS NULL THEN NULL ELSE now() END,$16)
      RETURNING id`, [actor.institutionId, input.termId, input.studentId, actor.office.id, input.month, input.granularity, workDate,
      input.hours, input.verificationSource, input.verificationReference, input.reason, input.exceptional, status, actor.id,
      requiresAdmin ? null : actor.id, input.amendsId ?? null]);
    await addHistory(db, credit.id, actor.id, status === 'approved' ? 'credit_verified' : prior ? 'amendment_submitted' : 'exception_submitted', {
      month: input.month, granularity: input.granularity, workDate, hours: input.hours, amendsId: input.amendsId ?? null,
      verificationSource: input.verificationSource, verificationReference: input.verificationReference, reason: input.reason,
    });
    await recordAudit({ actorId: actor.id, institutionId: actor.institutionId,
      action: status === 'approved' ? 'historical_duty_credit.verified' : 'historical_duty_credit.submitted',
      targetType: 'historical_duty_credit', targetId: credit.id,
      after: { studentId: input.studentId, termId: input.termId, month: input.month, hours: input.hours, status, amendsId: input.amendsId ?? null }, ip }, db);
    if (status === 'approved') await createNotification(db, { recipientId: input.studentId, institutionId: actor.institutionId,
      type: 'historical_duty_credit_verified', title: 'Historical duty hours verified',
      message: `${input.hours} historical duty hours for ${input.month} were verified and added to your semester totals.`,
      relatedType: 'historical_duty_credit', relatedId: credit.id, important: true, dedupeKey: `historical-duty-credit:${credit.id}:verified` });
    const { rows: [result] } = await db.query(`${SELECT_CREDIT} WHERE c.id=$1`, [credit.id]);
    return mapCredit(result);
  });
}

async function decide({ actor, id, approve, reason, ip }) {
  if (actor.role !== 'admin') throw forbidden();
  return withTransaction(async (db) => {
    const { rows: [credit] } = await db.query(`SELECT * FROM historical_duty_credits WHERE id=$1 AND institution_id=$2 FOR UPDATE`, [id, actor.institutionId]);
    if (!credit || credit.status !== 'pending_admin') throw fail(404, 'CREDIT_NOT_FOUND', 'Pending historical credit not found.');
    if (approve && credit.amends_id) {
      const { rows: [prior] } = await db.query(`SELECT * FROM historical_duty_credits WHERE id=$1 AND status='approved' FOR UPDATE`, [credit.amends_id]);
      if (!prior) throw fail(409, 'AMENDMENT_STALE', 'The original approved credit is no longer active.');
      await db.query(`UPDATE historical_duty_credits SET status='superseded',reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$1`, [prior.id, actor.id, reason]);
      await addHistory(db, prior.id, actor.id, 'credit_superseded', { replacedBy: credit.id, note: reason });
    }
    const status = approve ? 'approved' : 'rejected';
    await db.query('UPDATE historical_duty_credits SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 WHERE id=$1', [id, status, actor.id, reason]);
    await addHistory(db, id, actor.id, approve ? 'admin_approved' : 'admin_rejected', { note: reason, hours: Number(credit.hours) });
    await recordAudit({ actorId: actor.id, institutionId: actor.institutionId,
      action: `historical_duty_credit.${status}`, targetType: 'historical_duty_credit', targetId: id,
      before: { status: credit.status }, after: { status, note: reason, amendsId: credit.amends_id }, ip }, db);
    await createNotification(db, { recipientId: credit.student_id, institutionId: actor.institutionId,
      type: `historical_duty_credit_${status}`, title: status === 'approved' ? 'Historical duty hours approved' : 'Historical duty hours not approved',
      message: status === 'approved' ? 'Your historical duty hours were approved and added to your semester totals.' : `Your historical duty hour entry was not approved. ${reason}`,
      relatedType: 'historical_duty_credit', relatedId: id, important: true, dedupeKey: `historical-duty-credit:${id}:${status}` });
    return { id, status };
  });
}

export const approve = (args) => decide({ ...args, approve: true });
export const reject = (args) => decide({ ...args, approve: false });

export async function verifiedHistoricalSeconds(studentIds, termId, db = { query }, month = null) {
  if (!studentIds.length) return new Map();
  const params = [studentIds, termId];
  let monthClause = '';
  if (month) { params.push(month); monthClause = `AND credit_month=$3`; }
  const { rows } = await db.query(`SELECT student_id,round(sum(hours)*3600)::bigint AS seconds
    FROM historical_duty_credits WHERE student_id=ANY($1::uuid[]) AND term_id=$2 AND status='approved' ${monthClause}
    GROUP BY student_id`, params);
  return new Map(rows.map((row) => [row.student_id, Number(row.seconds || 0)]));
}

export async function monthlyHistoricalHours(userId, termId, db = { query }) {
  const map = await verifiedHistoricalSeconds([userId], termId, db);
  return roundHours((map.get(userId) ?? 0) / 3600);
}

