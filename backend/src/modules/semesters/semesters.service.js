import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { createNotification } from '../notifications/notifications.service.js';
import { buildSessions, localDateKey } from '../attendance/calc.js';
import { calculateSemesterProgress, verifiedSecondsForTerm } from './semester.rules.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
const roundHours = (seconds) => Math.round((seconds / 3600) * 100) / 100;

const mapTerm = (row) => ({
  id: row.id,
  institutionId: row.institution_id,
  institutionName: row.institution_name,
  academicYear: row.academic_year,
  semester: row.semester,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  completionDeadline: row.completion_deadline,
  timezone: row.timezone,
  finalizedAt: row.finalized_at,
});

async function findTerm(termId, db = { query }) {
  const { rows } = await db.query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t JOIN institutions i ON i.id = t.institution_id
     WHERE t.id = $1`,
    [termId],
  );
  return rows[0] ?? null;
}

async function requireTerm(termId, institutionId, db = { query }) {
  const row = await findTerm(termId, db);
  if (!row || row.institution_id !== institutionId) throw forbidden();
  return row;
}

export async function listTerms(institutionId) {
  const { rows } = await query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t JOIN institutions i ON i.id = t.institution_id
     WHERE t.institution_id = $1
     ORDER BY t.starts_on DESC, t.academic_year DESC, t.semester`,
    [institutionId],
  );
  return rows.map(mapTerm);
}

export async function currentTerm(institutionId) {
  const { rows } = await query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t JOIN institutions i ON i.id = t.institution_id
     WHERE t.institution_id = $1
       AND (now() AT TIME ZONE t.timezone)::date BETWEEN t.starts_on AND t.ends_on
     ORDER BY t.starts_on DESC LIMIT 1`,
    [institutionId],
  );
  return rows[0] ? mapTerm(rows[0]) : null;
}

export async function saveTerm({ actor, termId, input, ip }) {
  try {
    return await withTransaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`academic-term:${actor.institutionId}`]);
    let row;
    let before = null;
    if (termId) {
      const current = await requireTerm(termId, actor.institutionId, db);
      if (current.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'A finalized academic term cannot be changed.');
      before = mapTerm(current);
      ({ rows: [row] } = await db.query(
        `UPDATE academic_terms
         SET academic_year = $2, semester = $3, starts_on = $4, ends_on = $5,
             completion_deadline = $6, timezone = $7
         WHERE id = $1
         RETURNING *`,
        [termId, input.academicYear, input.semester, input.startsOn, input.endsOn, input.completionDeadline, input.timezone],
      ));
      row.institution_name = current.institution_name;
    } else {
      ({ rows: [row] } = await db.query(
        `INSERT INTO academic_terms
           (institution_id, academic_year, semester, starts_on, ends_on, completion_deadline, timezone, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [actor.institutionId, input.academicYear, input.semester, input.startsOn, input.endsOn, input.completionDeadline, input.timezone, actor.id],
      ));
      row.institution_name = actor.institution?.name ?? null;
    }
    const after = mapTerm(row);
    if (termId && (
      before.startsOn !== after.startsOn || before.endsOn !== after.endsOn
      || before.completionDeadline !== after.completionDeadline || before.timezone !== after.timezone
    )) {
      const { rows: assignedStudents } = await db.query(
        `SELECT DISTINCT student_id FROM semester_requirement_assignments
         WHERE term_id = $1 AND required_hours IS NOT NULL`, [termId],
      );
      for (const student of assignedStudents) {
        await createNotification(db, {
          recipientId: student.student_id, institutionId: actor.institutionId, type: 'semester_deadline_changed',
          title: 'Academic term dates changed',
          message: after.completionDeadline
            ? `The ${after.academicYear} ${after.semester} term dates or completion deadline changed. New deadline: ${after.completionDeadline}.`
            : `The ${after.academicYear} ${after.semester} term dates changed and no completion deadline is currently set.`,
          relatedType: 'academic_term', relatedId: after.id, important: true,
          dedupeKey: `term:${termId}:updated:${row.updated_at}`,
        });
      }
    }
    await recordAudit({
      actorId: actor.id,
      action: termId ? 'academic_term.update' : 'academic_term.create',
      targetType: 'academic_term',
      targetId: row.id,
      before,
      after,
      ip,
    }, db);
    return after;
    });
  } catch (err) {
    if (err.code === '23P01') throw new AppError(409, 'TERM_DATES_OVERLAP', 'This date range overlaps another term at your institution.');
    if (err.code === '23505') throw new AppError(409, 'TERM_ALREADY_EXISTS', 'A term with this academic year and semester already exists.');
    throw err;
  }
}

export async function finalizeTerm({ actor, termId, ip }) {
  return withTransaction(async (db) => {
    const current = await requireTerm(termId, actor.institutionId, db);
    if (current.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'This academic term is already finalized.');
    const { rows: [settings] } = await db.query(
      `SELECT semester_transition_policy FROM institution_duty_requirement_settings WHERE institution_id=$1`,
      [actor.institutionId],
    );
    if (!settings?.semester_transition_policy) {
      throw new AppError(409, 'TRANSITION_POLICY_REQUIRED', 'Configure a semester transition policy and finalize this term through the Semester Transition Planner.');
    }
    throw new AppError(409, 'TRANSITION_PLANNER_REQUIRED', 'Academic terms can only be closed through a reviewed Semester Transition Planner preview.');
  });
}

async function currentRequirements(termId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (a.student_id) a.student_id, a.office_id, o.name AS office_name, a.required_hours, a.assigned_at, a.assigned_by
     FROM semester_requirement_assignments a
     JOIN offices o ON o.id = a.office_id
     WHERE a.term_id = $1
     ORDER BY a.student_id, a.assigned_at DESC, a.id DESC`,
    [termId],
  );
  return new Map(rows.map((r) => [r.student_id, r]));
}

export async function listRequirements({ actor, termId }) {
  await requireTerm(termId, actor.institutionId);
  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email, o.id AS current_office_id, o.name AS current_office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE u.institution_id = $1 AND u.role = 'student'
     ORDER BY u.full_name`,
    [actor.institutionId],
  );
  const requirements = await currentRequirements(termId);
  return students.map((student) => {
    const requirement = requirements.get(student.id);
    return {
      id: student.id,
      fullName: student.full_name,
      email: student.email,
      officeId: requirement?.office_id ?? student.current_office_id,
      officeName: requirement?.office_name ?? student.current_office_name,
      requiredHours: requirement?.required_hours != null ? Number(requirement.required_hours) : null,
      assignedAt: requirement?.assigned_at ?? null,
    };
  });
}

export async function assignRequirement({ actor, termId, studentId, officeId, requiredHours, ip }) {
  return withTransaction(async (db) => {
    const term = await requireTerm(termId, actor.institutionId, db);
    if (term.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'Requirements cannot be changed for a finalized term.');
    const { rows: [student] } = await db.query(
      `SELECT id, full_name, institution_id, role FROM users WHERE id = $1`,
      [studentId],
    );
    if (!student || student.role !== 'student' || student.institution_id !== actor.institutionId) throw forbidden();
    const { rows: [office] } = await db.query(
      `SELECT id, name, institution_id FROM offices WHERE id = $1 AND is_active`,
      [officeId],
    );
    if (!office || office.institution_id !== actor.institutionId) throw forbidden();

    const { rows: previousRows } = await db.query(
      `SELECT id, office_id, required_hours, assigned_at
       FROM semester_requirement_assignments
       WHERE term_id = $1 AND student_id = $2
       ORDER BY assigned_at DESC, id DESC LIMIT 1`,
      [termId, studentId],
    );
    const previous = previousRows[0] ?? null;
    const { rows: [assignment] } = await db.query(
      `INSERT INTO semester_requirement_assignments
         (term_id, student_id, office_id, required_hours, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, assigned_at`,
      [termId, studentId, officeId, requiredHours, actor.id],
    );
    const before = previous
      ? { officeId: previous.office_id, requiredHours: previous.required_hours == null ? null : Number(previous.required_hours), assignedAt: previous.assigned_at }
      : null;
    const after = { officeId, officeName: office.name, requiredHours, assignedAt: assignment.assigned_at };
    await createNotification(db, {
      recipientId: student.id, institutionId: actor.institutionId, type: 'semester_requirement_changed',
      title: requiredHours == null ? 'Semester duty-hour requirement removed' : 'Semester duty-hour requirement updated',
      message: requiredHours == null
        ? `Your ${term.academic_year} ${term.semester} semester duty-hour requirement was removed.`
        : `Your ${term.academic_year} ${term.semester} semester duty-hour requirement is ${requiredHours} hours.${term.completion_deadline ? ` Completion deadline: ${term.completion_deadline}.` : ''}`,
      relatedType: 'academic_term', relatedId: term.id, important: true,
      dedupeKey: `semester-requirement:${assignment.id}`,
    });
    await recordAudit({
      actorId: actor.id,
      action: previous ? 'semester_requirement.update' : 'semester_requirement.assign',
      targetType: 'semester_requirement',
      targetId: assignment.id,
      before,
      after: { ...after, termId, studentId, studentName: student.full_name },
      ip,
    }, db);
    return { id: assignment.id, ...after };
  });
}

function sessionSeconds(sessions, fromDate, toDate) {
  return sessions.reduce((sum, session) => (
    session.counted && session.date >= fromDate && session.date <= toDate ? sum + session.seconds : sum
  ), 0);
}

async function progressForStudents(term, students, now) {
  if (students.length === 0) return [];
  const ids = students.map((student) => student.id);
  const { rows: eventRows } = await query(
    `SELECT user_id, id, event_type, recorded_at
     FROM attendance_events
     WHERE user_id = ANY($1::uuid[])
       AND recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
       AND recorded_at <  (($3::date + 2)::timestamp AT TIME ZONE $4)
     ORDER BY user_id, recorded_at, seq`,
    [ids, term.starts_on, term.ends_on, term.timezone],
  );
  const eventsByStudent = new Map(ids.map((id) => [id, []]));
  for (const event of eventRows) {
    eventsByStudent.get(event.user_id).push({ id: event.id, eventType: event.event_type, recordedAt: event.recorded_at });
  }

  const { rows: approvedDtrs } = await query(
    `SELECT d.user_id, d.status, d.verified_seconds, rv.snapshot
     FROM monthly_dtrs d
     JOIN dtr_revisions rv ON rv.dtr_id = d.id AND rv.revision_no = d.verified_revision
     WHERE d.user_id = ANY($1::uuid[]) AND d.status = 'approved'
       AND d.month >= to_char($2::date, 'YYYY-MM')
       AND d.month <= to_char($3::date, 'YYYY-MM')`,
    [ids, term.starts_on, term.ends_on],
  );
  const dtrsByStudent = new Map(ids.map((id) => [id, []]));
  for (const dtr of approvedDtrs) {
    dtrsByStudent.get(dtr.user_id).push(dtr);
  }

  const requirements = await currentRequirements(term.id);
  return students.map((student) => {
    const sessions = buildSessions(eventsByStudent.get(student.id), {
      now,
      timeZone: term.timezone,
      maxSessionSeconds: env.maxSessionHours * 3600,
    });
    const recordedSeconds = sessionSeconds(sessions, term.starts_on, term.ends_on);
    const verifiedSeconds = verifiedSecondsForTerm(
      dtrsByStudent.get(student.id), term.starts_on, term.ends_on, term.timezone,
    );
    const verifiedHours = roundHours(verifiedSeconds);
    const requirement = requirements.get(student.id);
    return {
      id: student.id,
      fullName: student.full_name,
      email: student.email,
      officeId: requirement?.office_id ?? student.office_id,
      officeName: student.office_name,
      recordedHours: roundHours(recordedSeconds),
      ...calculateSemesterProgress({
        requiredHours: requirement?.required_hours != null ? Number(requirement.required_hours) : null,
        verifiedHours,
      }),
      requirementAssignedAt: requirement?.assigned_at ?? null,
    };
  });
}

export async function myTerms(user) {
  const { rows } = await query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t JOIN institutions i ON i.id = t.institution_id
     WHERE t.institution_id = $1
       AND (t.starts_on <= (now() AT TIME ZONE t.timezone)::date OR EXISTS (
         SELECT 1 FROM semester_requirement_assignments a
         WHERE a.term_id = t.id AND a.student_id = $2
       ))
     ORDER BY t.starts_on DESC`,
    [user.institutionId, user.id],
  );
  const nowResult = await query('SELECT now() AS now');
  const terms = [];
  for (const row of rows) {
    const requirement = (await currentRequirements(row.id)).get(user.id);
    const [progress] = await progressForStudents(row, [{
      id: user.id,
      full_name: user.fullName,
      email: user.email,
      office_id: user.office?.id ?? null,
      office_name: user.office?.name ?? null,
    }], nowResult.rows[0].now);
    const isCurrent = localDateKey(nowResult.rows[0].now, row.timezone) >= row.starts_on
      && localDateKey(nowResult.rows[0].now, row.timezone) <= row.ends_on;
    terms.push({
      ...mapTerm(row),
      ...progress,
      id: row.id,
      termId: row.id,
      studentId: user.id,
      isCurrent,
      requirementAssigned: requirement?.required_hours != null,
      assignedHours: requirement?.required_hours != null ? Number(requirement.required_hours) : null,
    });
  }
  return terms;
}

export async function officeProgress({ actor, termId, officeId }) {
  const term = await requireTerm(termId, actor.institutionId);
  if (actor.role === 'supervisor' && actor.office?.id !== officeId) throw forbidden();
  const { rows: offices } = await query(
    'SELECT id, name FROM offices WHERE id = $1 AND institution_id = $2',
    [officeId, actor.institutionId],
  );
  if (!offices[0]) throw forbidden();
  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email, o.id AS office_id, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN LATERAL (
       SELECT a.office_id FROM semester_requirement_assignments a
       WHERE a.term_id = $1 AND a.student_id = u.id
       ORDER BY a.assigned_at DESC, a.id DESC LIMIT 1
     ) assigned ON true
     JOIN offices o ON o.id = COALESCE(assigned.office_id, d.office_id)
     WHERE u.institution_id = $3 AND u.role = 'student'
       AND COALESCE(assigned.office_id, d.office_id) = $2
     ORDER BY u.full_name`,
    [termId, officeId, actor.institutionId],
  );
  const nowResult = await query('SELECT now() AS now');
  return { term: mapTerm(term), office: offices[0], students: await progressForStudents(term, students, nowResult.rows[0].now) };
}

export async function allInstitutionProgress({ actor, termId }) {
  const term = await requireTerm(termId, actor.institutionId);
  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email, o.id AS office_id, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN LATERAL (
       SELECT a.office_id FROM semester_requirement_assignments a
       WHERE a.term_id = $1 AND a.student_id = u.id
       ORDER BY a.assigned_at DESC, a.id DESC LIMIT 1
     ) assigned ON true
     LEFT JOIN offices o ON o.id = COALESCE(assigned.office_id, d.office_id)
     WHERE u.institution_id = $2 AND u.role = 'student'
     ORDER BY u.full_name`,
    [termId, actor.institutionId],
  );
  const nowResult = await query('SELECT now() AS now');
  return { term: mapTerm(term), students: await progressForStudents(term, students.filter((s) => s.office_id), nowResult.rows[0].now) };
}
