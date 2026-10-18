import { query, withTransaction } from '../../db/pool.js';
import { verifiedSecondsForTerm } from '../semesters/semester.rules.js';
import { createNotification, notifyInstitutionAdmins, notifyOfficeSupervisors } from './notifications.service.js';

// Idempotency is enforced by the recipient/dedupe key constraint, so overlapping runs
// (or multiple application instances) cannot deliver the same reminder twice.
export async function runReminderSweep() {
  const { rows: clockRows } = await query('SELECT now() AS now');
  const now = new Date(clockRows[0].now).getTime();
  const { rows: assignments } = await query(
    `SELECT t.id AS term_id, t.institution_id, t.academic_year, t.semester,
            t.starts_on::text, t.ends_on::text, t.completion_deadline::text,
            t.timezone, (now() AT TIME ZONE t.timezone)::date::text AS local_today,
            a.id AS assignment_id, a.student_id, a.office_id, a.required_hours,
            s.full_name AS student_name
     FROM academic_terms t
     JOIN LATERAL (
       SELECT DISTINCT ON (student_id) id, student_id, office_id, required_hours
       FROM semester_requirement_assignments WHERE term_id = t.id
       ORDER BY student_id, assigned_at DESC, id DESC
     ) a ON a.required_hours IS NOT NULL
     JOIN users s ON s.id = a.student_id AND s.status = 'active'
     WHERE t.completion_deadline IS NOT NULL
       AND (now() AT TIME ZONE t.timezone)::date >= t.completion_deadline - 7
     ORDER BY t.institution_id, t.id, s.full_name`,
  );

  const relevant = assignments.filter((a) => a.local_today <= a.completion_deadline);
  if (relevant.length) {
    const ids = [...new Set(relevant.map((r) => r.student_id))];
    const terms = [...new Map(relevant.map((r) => [r.term_id, r])).values()];
    const { rows: dtrs } = await query(
      `SELECT d.user_id, d.status, rv.snapshot
       FROM monthly_dtrs d
       JOIN dtr_revisions rv ON rv.dtr_id = d.id AND rv.revision_no = d.verified_revision
       WHERE d.user_id = ANY($1::uuid[]) AND d.status = 'approved'
         AND EXISTS (
           SELECT 1 FROM academic_terms t
           WHERE t.completion_deadline IS NOT NULL
             AND t.id = ANY($2::uuid[])
             AND d.month >= to_char(t.starts_on, 'YYYY-MM')
             AND d.month <= to_char(t.ends_on, 'YYYY-MM')
         )`,
      [ids, terms.map((t) => t.term_id)],
    );
    const dtrsByStudent = new Map(ids.map((id) => [id, []]));
    for (const dtr of dtrs) dtrsByStudent.get(dtr.user_id)?.push(dtr);

    for (const assignment of relevant) {
      const verifiedSeconds = verifiedSecondsForTerm(
        dtrsByStudent.get(assignment.student_id) ?? [],
        assignment.starts_on,
        assignment.ends_on,
        assignment.timezone,
      );
      const remaining = Math.max(0, Number(assignment.required_hours) - verifiedSeconds / 3600);
      if (remaining <= 0) continue;

      const overdue = assignment.local_today >= assignment.completion_deadline;
      const stage = overdue ? 'overdue' : 'approaching';
      await withTransaction(async (db) => {
        await createNotification(db, {
          recipientId: assignment.student_id, institutionId: assignment.institution_id,
          type: `semester_requirement_${stage}`,
          title: overdue ? 'Semester requirement deadline passed' : 'Semester requirement deadline approaching',
          message: overdue
            ? `You have ${remaining.toFixed(2)} verified hours remaining for ${assignment.academic_year} ${assignment.semester}. The deadline was ${assignment.completion_deadline}.`
            : `You have ${remaining.toFixed(2)} verified hours remaining for ${assignment.academic_year} ${assignment.semester}. The deadline is ${assignment.completion_deadline}.`,
          relatedType: 'academic_term', relatedId: assignment.term_id, important: true,
          dedupeKey: `semester-reminder:${assignment.assignment_id}:${stage}`,
        });
        await notifyOfficeSupervisors(db, {
          officeId: assignment.office_id, institutionId: assignment.institution_id,
          type: `assistant_semester_requirement_${stage}`,
          title: overdue ? 'Student Assistant semester requirement overdue' : 'Student Assistant semester deadline approaching',
          message: `${assignment.student_name} has ${remaining.toFixed(2)} verified hours remaining for ${assignment.academic_year} ${assignment.semester}; deadline ${assignment.completion_deadline}.`,
          relatedType: 'academic_term', relatedId: assignment.term_id, important: true,
          dedupeKey: `semester-reminder:${assignment.assignment_id}:${stage}`,
        });
        await notifyInstitutionAdmins(db, {
          institutionId: assignment.institution_id, type: `semester_requirement_${stage}`,
          title: overdue ? 'Student Assistant semester requirement overdue' : 'Student Assistant semester deadline approaching',
          message: `${assignment.student_name} has ${remaining.toFixed(2)} verified hours remaining for ${assignment.academic_year} ${assignment.semester}; deadline ${assignment.completion_deadline}.`,
          relatedType: 'student', relatedId: assignment.student_id, important: true,
          dedupeKey: `semester-reminder:${assignment.assignment_id}:${stage}`,
        });
      });
    }
  }

  // Surface missing assignments to institution administrators only while a term is active.
  const { rows: missing } = await query(
    `SELECT t.id AS term_id, t.institution_id, t.academic_year, t.semester, s.id AS student_id, s.full_name
     FROM academic_terms t
     JOIN users s ON s.institution_id = t.institution_id AND s.role = 'student' AND s.status = 'active'
     WHERE (now() AT TIME ZONE t.timezone)::date BETWEEN t.starts_on AND t.ends_on
       AND NOT EXISTS (
         SELECT 1 FROM semester_requirement_assignments a
         WHERE a.term_id = t.id AND a.student_id = s.id AND a.required_hours IS NOT NULL
       )`,
  );
  for (const item of missing) {
    await withTransaction((db) => notifyInstitutionAdmins(db, {
      institutionId: item.institution_id, type: 'semester_assignment_missing',
      title: 'Active-term requirement missing',
      message: `${item.full_name} has no duty-hour requirement assigned for ${item.academic_year} ${item.semester}.`,
      relatedType: 'student', relatedId: item.student_id, important: true,
      dedupeKey: `missing-semester-assignment:${item.term_id}:${item.student_id}`,
    }));
  }

  const [dtrReviews, absenceReviews, caseReviews] = await Promise.all([
    query(
      `SELECT d.id, u.institution_id, d.office_id, d.month::text AS label, p.review_sla_hours, e.id AS event_id, e.created_at
       FROM monthly_dtrs d
       JOIN users u ON u.id = d.user_id
       JOIN institution_dtr_policies p ON p.institution_id = u.institution_id
       JOIN LATERAL (
         SELECT id, created_at FROM dtr_events WHERE dtr_id = d.id AND action = 'submitted' ORDER BY id DESC LIMIT 1
       ) e ON true
       WHERE p.review_sla_hours IS NOT NULL AND d.status IN ('submitted', 'under_review')`,
    ),
    query(
      `SELECT a.id, u.institution_id, a.office_id, e.id AS event_id, e.created_at, p.review_sla_hours
       FROM absence_notices a
       JOIN users u ON u.id = a.user_id
       JOIN institution_dtr_policies p ON p.institution_id = u.institution_id
       JOIN LATERAL (
         SELECT id, created_at FROM absence_events WHERE absence_id = a.id AND to_status IN ('pending', 'acknowledged') ORDER BY id DESC LIMIT 1
       ) e ON true
       WHERE p.review_sla_hours IS NOT NULL AND a.status IN ('pending', 'acknowledged')`,
    ),
    query(
      `SELECT c.id, u.institution_id, c.office_id, c.reference AS label, p.review_sla_hours,
              latest.id AS event_id, latest.created_at
       FROM compliance_cases c
       JOIN users u ON u.id = c.user_id
       JOIN institution_dtr_policies p ON p.institution_id = u.institution_id
       JOIN LATERAL (
         SELECT id, created_at FROM case_events WHERE case_id = c.id AND to_status = 'under_review' ORDER BY id DESC LIMIT 1
       ) latest ON true
       WHERE p.review_sla_hours IS NOT NULL AND c.status = 'under_review'`,
    ),
  ]);

  const reviewCounts = { approaching: 0, overdue: 0 };
  const notifyReviewTask = async ({ rows, kind, recipientGroup, relatedType }) => {
    for (const task of rows) {
      const remainingMs = new Date(task.created_at).getTime() + Number(task.review_sla_hours) * 3_600_000 - now;
      if (remainingMs > 24 * 3_600_000) continue;
      const overdue = remainingMs <= 0;
      const stage = overdue ? 'overdue' : 'approaching';
      reviewCounts[stage]++;
      const target = {
        institutionId: task.institution_id,
        type: `${kind}_review_${stage}`,
        title: overdue ? `${kindLabel(kind)} review overdue` : `${kindLabel(kind)} review deadline approaching`,
        message: overdue
          ? `${kindLabel(kind)} ${task.label ? task.label : ''} has passed its ${task.review_sla_hours}-hour review time limit.`.trim()
          : `${kindLabel(kind)} ${task.label ? task.label : ''} is within 24 hours of its ${task.review_sla_hours}-hour review time limit.`.trim(),
        relatedType, relatedId: task.id, important: true,
        dedupeKey: `review-sla:${kind}:${task.id}:${task.event_id ?? task.id}:${stage}`,
      };
      await withTransaction(async (db) => {
        if (recipientGroup === 'office') await notifyOfficeSupervisors(db, { officeId: task.office_id, ...target });
        else await notifyInstitutionAdmins(db, target);
      });
    }
  };
  await notifyReviewTask({ rows: dtrReviews.rows, kind: 'dtr', recipientGroup: 'office', relatedType: 'monthly_dtr' });
  await notifyReviewTask({ rows: absenceReviews.rows, kind: 'absence', recipientGroup: 'office', relatedType: 'absence_notice' });
  await notifyReviewTask({ rows: caseReviews.rows, kind: 'case', recipientGroup: 'institution', relatedType: 'compliance_case' });

  return { deadlineAssignmentsChecked: relevant.length, missingAssignments: missing.length, reviewReminders: reviewCounts };
}

function kindLabel(kind) {
  return kind === 'dtr' ? 'DTR' : kind === 'case' ? 'Compliance case' : 'Absence notice';
}
