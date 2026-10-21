import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { buildSessions, localDateKey } from '../attendance/calc.js';
import { verifiedSecondsForTerm } from '../semesters/semester.rules.js';
import {
  calculateHistoricalAttendancePace,
  calculateConfirmedScheduleHours,
  calculateDutyForecast,
} from './forecast.calc.js';

const maxSessionSeconds = () => env.maxSessionHours * 3600;

/**
 * Resolves an academic term: by specific termId (validated to institution),
 * or active term by local date, or most recent term.
 */
async function resolveTerm(institutionId, termId = null, db = { query }) {
  if (termId) {
    const { rows } = await db.query(
      `SELECT t.*, i.name AS institution_name
       FROM academic_terms t
       JOIN institutions i ON i.id = t.institution_id
       WHERE t.id = $1 AND t.institution_id = $2`,
      [termId, institutionId],
    );
    if (rows[0]) return rows[0];
  }

  // Active term by current local date
  const { rows } = await db.query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t
     JOIN institutions i ON i.id = t.institution_id
     WHERE t.institution_id = $1
       AND (now() AT TIME ZONE t.timezone)::date BETWEEN t.starts_on AND t.ends_on
     ORDER BY t.starts_on DESC LIMIT 1`,
    [institutionId],
  );
  if (rows[0]) return rows[0];

  // Fallback: most recent term
  const { rows: fallback } = await db.query(
    `SELECT t.*, i.name AS institution_name
     FROM academic_terms t
     JOIN institutions i ON i.id = t.institution_id
     WHERE t.institution_id = $1
     ORDER BY t.starts_on DESC LIMIT 1`,
    [institutionId],
  );
  return fallback[0] ?? null;
}

/**
 * Retrieves configured historical forecast window in weeks from institution settings.
 */
async function getForecastHistoricalWeeks(institutionId, db = { query }) {
  try {
    const { rows } = await db.query(
      'SELECT forecast_historical_weeks FROM institution_duty_requirement_settings WHERE institution_id = $1',
      [institutionId],
    );
    return Number(rows[0]?.forecast_historical_weeks) || 4;
  } catch {
    return 4;
  }
}

/**
 * Batch-loads confirmed (approved) duty schedules and schedule days for a set of students in a term.
 */
async function loadConfirmedSchedules(studentIds, termId, db = { query }) {
  if (!studentIds.length) return new Map();

  const { rows: schedules } = await db.query(
    `SELECT s.id, s.student_id, s.effective_starts_on::text, s.effective_ends_on::text
     FROM student_duty_schedules s
     WHERE s.student_id = ANY($1::uuid[])
       AND s.term_id = $2
       AND s.status = 'approved'`,
    [studentIds, termId],
  );

  if (!schedules.length) return new Map();

  const scheduleIds = schedules.map((s) => s.id);
  const { rows: days } = await db.query(
    `SELECT schedule_id, weekday, starts_at::text, ends_at::text,
            afternoon_starts_at::text, afternoon_ends_at::text
     FROM student_duty_schedule_days
     WHERE schedule_id = ANY($1::uuid[])
     ORDER BY schedule_id, weekday`,
    [scheduleIds],
  );

  const daysBySchedule = new Map();
  for (const day of days) {
    if (!daysBySchedule.has(day.schedule_id)) daysBySchedule.set(day.schedule_id, []);
    daysBySchedule.get(day.schedule_id).push({
      weekday: day.weekday,
      startsAt: day.starts_at,
      endsAt: day.ends_at,
      afternoonStartsAt: day.afternoon_starts_at,
      afternoonEndsAt: day.afternoon_ends_at,
    });
  }

  const result = new Map();
  for (const sched of schedules) {
    result.set(sched.student_id, {
      id: sched.id,
      effectiveStartsOn: sched.effective_starts_on,
      effectiveEndsOn: sched.effective_ends_on,
      days: daysBySchedule.get(sched.id) ?? [],
    });
  }
  return result;
}

/**
 * Calculates forecasts for a batch of students in a term (avoids N+1 queries).
 */
async function computeForecastsForStudents({
  students,
  term,
  historicalWeeks,
  now,
  db = { query },
}) {
  if (!students.length || !term) return [];

  const studentIds = students.map((s) => s.id);
  const today = localDateKey(now, term.timezone);
  const deadline = term.completion_deadline ? String(term.completion_deadline).slice(0, 10) : term.ends_on ? String(term.ends_on).slice(0, 10) : null;

  // Window start date: `historicalWeeks` before today (or term start date if later)
  const windowDays = historicalWeeks * 7;
  const windowStartCandidate = new Date(now.getTime() - windowDays * 86400000);
  const windowStartDate = [localDateKey(windowStartCandidate, term.timezone), term.starts_on].sort().at(-1);

  // 1. Term requirements
  const { rows: reqRows } = await db.query(
    `SELECT DISTINCT ON (a.student_id) a.student_id, a.office_id, o.name AS office_name, a.required_hours
     FROM semester_requirement_assignments a
     JOIN offices o ON o.id = a.office_id
     WHERE a.student_id = ANY($1::uuid[]) AND a.term_id = $2
     ORDER BY a.student_id, a.assigned_at DESC`,
    [studentIds, term.id],
  );
  const requirements = new Map(reqRows.map((r) => [r.student_id, r]));

  // 2. Approved DTRs (for validated completed hours)
  const { rows: approvedDtrs } = await db.query(
    `SELECT d.user_id, d.status, d.verified_seconds, rv.snapshot
     FROM monthly_dtrs d
     JOIN dtr_revisions rv ON rv.dtr_id = d.id AND rv.revision_no = d.verified_revision
     WHERE d.user_id = ANY($1::uuid[]) AND d.status = 'approved'
       AND d.month >= to_char($2::date, 'YYYY-MM')
       AND d.month <= to_char($3::date, 'YYYY-MM')`,
    [studentIds, term.starts_on, term.ends_on],
  );
  const dtrsByStudent = new Map(studentIds.map((id) => [id, []]));
  for (const dtr of approvedDtrs) {
    dtrsByStudent.get(dtr.user_id).push(dtr);
  }

  // 3. Raw attendance events in term for total recorded hours and in historical window for pace
  const { rows: eventRows } = await db.query(
    `SELECT user_id, id, event_type, recorded_at
     FROM attendance_events
     WHERE user_id = ANY($1::uuid[])
       AND recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
       AND recorded_at < (($3::date + 2)::timestamp AT TIME ZONE $4)
     ORDER BY user_id, recorded_at, seq`,
    [studentIds, term.starts_on, term.ends_on, term.timezone],
  );
  const eventsByStudent = new Map(studentIds.map((id) => [id, []]));
  for (const ev of eventRows) {
    eventsByStudent.get(ev.user_id).push({
      id: ev.id,
      eventType: ev.event_type,
      recordedAt: ev.recorded_at,
    });
  }

  // 4. Confirmed duty schedules
  const confirmedSchedules = await loadConfirmedSchedules(studentIds, term.id, db);
  const { rows: recoveryRows } = await db.query(
    `SELECT student_id, sum(extract(epoch FROM (ends_at - starts_at)) / 3600)::numeric AS hours
       FROM duty_recovery_shifts
      WHERE student_id = ANY($1::uuid[]) AND institution_id = $2 AND status = 'approved'
        AND shift_date > $3::date AND shift_date <= $4::date
      GROUP BY student_id`,
    [studentIds, term.id ? term.institution_id ?? students[0]?.institution_id : null, today, deadline ?? term.ends_on],
  );
  const recoveryHoursByStudent = new Map(recoveryRows.map((row) => [row.student_id, Number(row.hours)]));

  // Compute forecast for each student
  return students.map((student) => {
    const requirement = requirements.get(student.id);
    const studentEvents = eventsByStudent.get(student.id) ?? [];
    const studentDtrs = dtrsByStudent.get(student.id) ?? [];
    const confirmedSched = confirmedSchedules.get(student.id) ?? null;

    // Total validated hours from approved DTRs
    const verifiedSecs = verifiedSecondsForTerm(studentDtrs, term.starts_on, term.ends_on, term.timezone);
    const validatedCompletedHours = Math.round((verifiedSecs / 3600) * 100) / 100;

    // Total valid recorded hours in the term
    const allTermSessions = buildSessions(studentEvents, {
      now,
      timeZone: term.timezone,
      maxSessionSeconds: maxSessionSeconds(),
    });
    const validRecordedSecs = allTermSessions.reduce(
      (sum, s) => (s.counted && s.date >= term.starts_on && s.date <= term.ends_on && Number.isFinite(s.seconds) ? sum + s.seconds : sum),
      0,
    );
    const recordedHours = Math.round((validRecordedSecs / 3600) * 100) / 100;

    // Calculate actual historical pace
    const historicalPace = calculateHistoricalAttendancePace({
      events: studentEvents,
      windowStartDate,
      today,
      timeZone: term.timezone,
      maxSessionSeconds: maxSessionSeconds(),
      configuredWindowWeeks: historicalWeeks,
      now,
    });

    // Calculate confirmed future schedule hours
    const confirmedSchedule = calculateConfirmedScheduleHours({
      approvedSchedule: confirmedSched,
      approvedRecoveryHours: recoveryHoursByStudent.get(student.id) ?? 0,
      today,
      deadline,
    });

    // Compute duty forecast
    const forecast = calculateDutyForecast({
      requiredHours: requirement?.required_hours != null ? Number(requirement.required_hours) : null,
      validatedCompletedHours,
      recordedHours,
      deadline,
      today,
      historicalPace,
      confirmedSchedule,
    });

    return {
      student: {
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        status: student.status ?? null,
        officeId: requirement?.office_id ?? student.office_id,
        officeName: requirement?.office_name ?? student.office_name,
      },
      term: {
        id: term.id,
        academicYear: term.academic_year,
        semester: term.semester,
        startsOn: term.starts_on,
        endsOn: term.ends_on,
        completionDeadline: term.completion_deadline,
        timezone: term.timezone,
      },
      ...forecast,
      historicalPaceDetails: {
        windowStartDate,
        today,
        windowWeeks: historicalWeeks,
        historicalHours: historicalPace.historicalHours,
        sessionCount: historicalPace.sessionCount,
        activeWeeksCount: historicalPace.activeWeeksCount,
        elapsedWeeks: historicalPace.elapsedWeeks,
      },
    };
  });
}

function summarizeForecasts(items) {
  const summary = {
    total: items.length,
    completed: 0,
    onTrack: 0,
    atRisk: 0,
    insufficientData: 0,
  };
  for (const item of items) {
    if (item.status === 'completed') summary.completed += 1;
    else if (item.status === 'on_track') summary.onTrack += 1;
    else if (item.status === 'at_risk') summary.atRisk += 1;
    else if (item.status === 'insufficient_data') summary.insufficientData += 1;
  }
  return summary;
}

/**
 * Returns duty completion forecast for one student.
 */
export async function getStudentForecast(studentId, { termId = null, actor, db = { query } }) {
  // Authorization
  if (actor.role === 'student' && actor.id !== studentId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only view your own duty completion forecast.');
  }

  // Load student
  const { rows: students } = await db.query(
    `SELECT u.id, u.full_name, u.email, u.status, u.institution_id,
            d.office_id, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE u.id = $1 AND u.role = 'student'`,
    [studentId],
  );
  const student = students[0];
  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student Assistant not found.');

  // Multi-institution check
  if (student.institution_id !== actor.institutionId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot access records outside your institution.');
  }

  // Supervisor office scope
  if (actor.role === 'supervisor') {
    if (!actor.office?.id || student.office_id !== actor.office.id) {
      throw new AppError(403, 'FORBIDDEN', 'You may only view forecasts for students assigned to your office.');
    }
  }

  const term = await resolveTerm(actor.institutionId, termId, db);
  if (!term) {
    return {
      term: null,
      forecast: null,
      message: 'No academic term configured for this institution.',
    };
  }

  const historicalWeeks = await getForecastHistoricalWeeks(actor.institutionId, db);
  const nowResult = await db.query('SELECT now() AS now');
  const now = nowResult.rows[0].now;

  const [forecast] = await computeForecastsForStudents({
    students: [student],
    term,
    historicalWeeks,
    now,
    db,
  });

  return forecast;
}

/**
 * Returns forecasts for all active students assigned to a supervisor's office.
 */
export async function getOfficeForecasts(officeId, { termId = null, actor, db = { query } }) {
  // Authorization
  if (actor.role === 'supervisor' && actor.office?.id !== officeId) {
    throw new AppError(403, 'FORBIDDEN', 'You may only view forecasts for your own office.');
  }

  // Verify office belongs to institution
  const { rows: officeRows } = await db.query(
    'SELECT id, code, name FROM offices WHERE id = $1 AND institution_id = $2',
    [officeId, actor.institutionId],
  );
  if (!officeRows[0]) throw new AppError(404, 'NOT_FOUND', 'Office not found.');
  const office = officeRows[0];

  const term = await resolveTerm(actor.institutionId, termId, db);
  if (!term) {
    return { office, term: null, summary: { total: 0, completed: 0, onTrack: 0, atRisk: 0, insufficientData: 0 }, items: [] };
  }

  const { rows: students } = await db.query(
    `SELECT u.id, u.full_name, u.email, $1::uuid AS office_id, $2::text AS office_name
     FROM duty_assignments d
     JOIN users u ON u.id = d.user_id
     WHERE d.office_id = $1 AND d.ends_on IS NULL AND u.role = 'student' AND u.status = 'active'
     ORDER BY u.full_name`,
    [officeId, office.name],
  );

  const historicalWeeks = await getForecastHistoricalWeeks(actor.institutionId, db);
  const nowResult = await db.query('SELECT now() AS now');
  const now = nowResult.rows[0].now;

  const items = await computeForecastsForStudents({
    students,
    term,
    historicalWeeks,
    now,
    db,
  });

  return {
    office,
    term: {
      id: term.id,
      academicYear: term.academic_year,
      semester: term.semester,
      startsOn: term.starts_on,
      endsOn: term.ends_on,
      completionDeadline: term.completion_deadline,
    },
    summary: summarizeForecasts(items),
    items,
  };
}

/**
 * Returns institution-wide forecasts (admin only).
 */
export async function getInstitutionForecasts({ termId = null, actor, db = { query } }) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only administrators may view institution-wide forecasts.');
  }

  const term = await resolveTerm(actor.institutionId, termId, db);
  if (!term) {
    return { term: null, summary: { total: 0, completed: 0, onTrack: 0, atRisk: 0, insufficientData: 0 }, items: [] };
  }

  const { rows: students } = await db.query(
    `SELECT u.id, u.full_name, u.email, d.office_id, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE u.institution_id = $1 AND u.role = 'student' AND u.status = 'active'
     ORDER BY o.name NULLS LAST, u.full_name`,
    [actor.institutionId],
  );

  const historicalWeeks = await getForecastHistoricalWeeks(actor.institutionId, db);
  const nowResult = await db.query('SELECT now() AS now');
  const now = nowResult.rows[0].now;

  const items = await computeForecastsForStudents({
    students,
    term,
    historicalWeeks,
    now,
    db,
  });

  return {
    term: {
      id: term.id,
      academicYear: term.academic_year,
      semester: term.semester,
      startsOn: term.starts_on,
      endsOn: term.ends_on,
      completionDeadline: term.completion_deadline,
    },
    summary: summarizeForecasts(items),
    items,
  };
}

