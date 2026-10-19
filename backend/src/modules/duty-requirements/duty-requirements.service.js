import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { verifiedSecondsForTerm } from '../semesters/semester.rules.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');
const notFound = () => new AppError(404, 'NOT_FOUND', 'Duty schedule or requirement not found.');
const hours = (value) => value == null ? null : Number(value);
const timeText = (value) => typeof value === 'string' ? value.slice(0, 5) : value;
const timeMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const dayPeriods = (day) => [
  { label: 'morning', startsAt: timeText(day.startsAt), endsAt: timeText(day.endsAt) },
  ...(day.afternoonStartsAt && day.afternoonEndsAt
    ? [{ label: 'afternoon', startsAt: timeText(day.afternoonStartsAt), endsAt: timeText(day.afternoonEndsAt) }]
    : []),
];
const dayHours = (day) => dayPeriods(day).reduce((total, period) =>
  total + (timeMinutes(period.endsAt) - timeMinutes(period.startsAt)) / 60, 0);

function publicPolicy(row) {
  if (!row) return null;
  return {
    id: row.id,
    termId: row.term_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeName: row.scope_name ?? null,
    effectiveStartsOn: row.effective_starts_on,
    effectiveEndsOn: row.effective_ends_on,
    requiredTermHours: hours(row.required_term_hours),
    minimumDailyHours: hours(row.minimum_daily_hours),
    maximumDailyHours: hours(row.maximum_daily_hours),
    permittedWeekdays: row.permitted_weekdays.map(Number),
    permittedTimeWindows: row.permitted_time_windows,
    exceptionReason: row.exception_reason,
    updatedAt: row.updated_at,
  };
}

function publicSchedule(row, days = []) {
  if (!row) return null;
  return {
    id: row.id,
    termId: row.term_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    officeId: row.office_id,
    officeName: row.office_name,
    version: row.version,
    requestKind: row.request_kind,
    status: row.status,
    effectiveStartsOn: row.effective_starts_on,
    effectiveEndsOn: row.effective_ends_on,
    days,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewReason: row.review_reason,
    suggestedDays: row.suggested_days ?? [],
    updatedAt: row.updated_at,
  };
}

async function termFor(termId, institutionId, db = { query }) {
  const { rows } = await db.query(
    `SELECT id, institution_id, academic_year, semester, starts_on::text, ends_on::text,
            completion_deadline::text, timezone, finalized_at
     FROM academic_terms WHERE id = $1 AND institution_id = $2`,
    [termId, institutionId],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function settingsFor(institutionId, db = { query }) {
  const { rows } = await db.query(
    `SELECT default_minimum_daily_hours FROM institution_duty_requirement_settings WHERE institution_id = $1`,
    [institutionId],
  );
  return hours(rows[0]?.default_minimum_daily_hours) ?? 3;
}

async function policiesFor(termId, institutionId, db = { query }) {
  const { rows } = await db.query(
    `SELECT p.*,
            CASE p.scope_type
              WHEN 'institution' THEN i.name
              WHEN 'office' THEN o.name
              ELSE u.full_name
            END AS scope_name
     FROM duty_requirement_policies p
     JOIN institutions i ON i.id = p.institution_id
     LEFT JOIN offices o ON p.scope_type = 'office' AND o.id = p.scope_id
     LEFT JOIN users u ON p.scope_type = 'student' AND u.id = p.scope_id
     WHERE p.term_id = $1 AND p.institution_id = $2
     ORDER BY p.effective_starts_on, p.scope_type, p.scope_id`,
    [termId, institutionId],
  );
  return rows;
}

async function requirementFor({ user, term, officeId, startsOn, endsOn, db = { query } }) {
  const policies = await policiesFor(term.id, user.institutionId, db);
  const active = policies.filter((policy) =>
    policy.effective_starts_on <= startsOn && policy.effective_ends_on >= endsOn);
  const policy = active.find((p) => p.scope_type === 'student' && p.scope_id === user.id)
    ?? active.find((p) => p.scope_type === 'office' && p.scope_id === officeId)
    ?? active.find((p) => p.scope_type === 'institution' && p.scope_id === user.institutionId)
    ?? null;
  const { rows: assignments } = await db.query(
    `SELECT required_hours FROM semester_requirement_assignments
     WHERE term_id = $1 AND student_id = $2 ORDER BY assigned_at DESC, id DESC LIMIT 1`,
    [term.id, user.id],
  );
  const assignedHours = hours(assignments[0]?.required_hours);
  const defaultMinimumDailyHours = await settingsFor(user.institutionId, db);
  const individualPolicyHours = policy?.scope_type === 'student' && policy.required_term_hours != null
    ? hours(policy.required_term_hours)
    : null;
  const requiredTermHours = individualPolicyHours ?? assignedHours ?? hours(policy?.required_term_hours);
  return {
    policy: publicPolicy(policy),
    defaultMinimumDailyHours,
    requiredTermHours,
    totalHoursSource: requiredTermHours == null
      ? null
      : individualPolicyHours != null ? 'individual_exception'
        : assignedHours != null ? 'individual_assignment' : policy?.scope_type ?? null,
    minimumDailyHours: hours(policy?.minimum_daily_hours) ?? defaultMinimumDailyHours,
    maximumDailyHours: hours(policy?.maximum_daily_hours),
    permittedWeekdays: (policy?.permitted_weekdays ?? []).map(Number).filter((weekday) => weekday <= 6),
    permittedTimeWindows: policy?.permitted_time_windows ?? [],
    completionDeadline: term.completion_deadline,
    term: {
      id: term.id,
      academicYear: term.academic_year,
      semester: term.semester,
      startsOn: term.starts_on,
      endsOn: term.ends_on,
      completionDeadline: term.completion_deadline,
      timezone: term.timezone,
      finalizedAt: term.finalized_at,
    },
  };
}

function scheduleIssues(days, requirement) {
  const issues = [];
  if (!requirement.policy) {
    return [{ code: 'NO_POLICY', message: 'No duty policy covers this schedule period. Ask an administrator to configure one.' }];
  }
  if (requirement.requiredTermHours == null) {
    issues.push({ code: 'NO_TERM_HOURS', message: 'No total term-hour requirement is assigned for this student.' });
  }
  if (days.length === 0) issues.push({ code: 'NO_DAYS', message: 'Add at least one proposed duty day.' });
  const seen = new Set();
  for (const day of days) {
    if (seen.has(day.weekday)) {
      issues.push({ code: 'DUPLICATE_DAY', weekday: day.weekday, message: 'Use one schedule entry per weekday, with a morning period and an optional afternoon period.' });
    }
    seen.add(day.weekday);
    if (day.weekday === 7) {
      issues.push({ code: 'SUNDAY_NOT_SUPPORTED', weekday: day.weekday, message: 'Sunday is not a supported duty weekday. Student Assistants may schedule Monday through Saturday.' });
    }
    if (!requirement.permittedWeekdays.includes(day.weekday)) {
      issues.push({ code: 'DAY_NOT_PERMITTED', weekday: day.weekday, message: `Weekday ${day.weekday} is not permitted by the effective policy.` });
    }
    const periods = dayPeriods(day);
    const duration = dayHours(day);
    if (duration < requirement.minimumDailyHours) {
      issues.push({ code: 'BELOW_MINIMUM_DAILY_HOURS', weekday: day.weekday, message: `Each proposed duty day must be at least ${requirement.minimumDailyHours} hours.` });
    }
    if (requirement.maximumDailyHours != null && duration > requirement.maximumDailyHours) {
      issues.push({ code: 'ABOVE_MAXIMUM_DAILY_HOURS', weekday: day.weekday, message: `Each proposed duty day must be no more than ${requirement.maximumDailyHours} hours.` });
    }
    for (const period of periods) {
      const insideWindow = requirement.permittedTimeWindows.some((window) =>
        period.startsAt >= timeText(window.startTime) && period.endsAt <= timeText(window.endTime));
      if (!insideWindow) {
        issues.push({ code: 'OUTSIDE_TIME_WINDOW', weekday: day.weekday, period: period.label, message: `The proposed ${period.label} time on weekday ${day.weekday} must fit within one permitted time window.` });
      }
    }
  }
  return issues;
}

export async function adminContext({ actor, termId }) {
  const term = await termFor(termId, actor.institutionId);
  const policies = await policiesFor(termId, actor.institutionId);
  return {
    term: {
      id: term.id, academicYear: term.academic_year, semester: term.semester,
      startsOn: term.starts_on, endsOn: term.ends_on,
      completionDeadline: term.completion_deadline, timezone: term.timezone,
      finalizedAt: term.finalized_at,
    },
    defaultMinimumDailyHours: await settingsFor(actor.institutionId),
    policies: policies.map(publicPolicy),
  };
}

export async function updateDefaultMinimum({ actor, minimumDailyHours, ip }) {
  try {
    return await withTransaction(async (db) => {
    const before = await settingsFor(actor.institutionId, db);
    const { rows: [row] } = await db.query(
      `INSERT INTO institution_duty_requirement_settings (institution_id, default_minimum_daily_hours, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (institution_id) DO UPDATE
         SET default_minimum_daily_hours = EXCLUDED.default_minimum_daily_hours,
             updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING default_minimum_daily_hours`,
      [actor.institutionId, minimumDailyHours, actor.id],
    );
    await recordAudit({
      actorId: actor.id, action: 'duty_requirement.default_minimum_updated',
      targetType: 'institution', targetId: actor.institutionId,
      before: { defaultMinimumDailyHours: before },
      after: { defaultMinimumDailyHours: hours(row.default_minimum_daily_hours) }, ip,
    }, db);
      return hours(row.default_minimum_daily_hours);
    });
  } catch (err) {
    if (err.code === '23514') throw new AppError(409, 'POLICY_CONFLICT', 'The default minimum exceeds a configured policy maximum. Update that policy first.');
    throw err;
  }
}

export async function savePolicy({ actor, policyId, input, ip }) {
  try {
    return await withTransaction(async (db) => {
      const term = await termFor(input.termId, actor.institutionId, db);
      if (term.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'Requirements cannot be changed for a finalized term.');
      if (input.effectiveStartsOn < term.starts_on || input.effectiveEndsOn > term.ends_on) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Effective dates must be within the academic term.');
      }
      const scopeId = input.scopeType === 'institution' ? actor.institutionId : input.scopeId;
      if (input.scopeType === 'office') {
        const { rowCount } = await db.query('SELECT 1 FROM offices WHERE id = $1 AND institution_id = $2', [scopeId, actor.institutionId]);
        if (!rowCount) throw forbidden();
      }
      if (input.scopeType === 'student') {
        const { rowCount } = await db.query("SELECT 1 FROM users WHERE id = $1 AND institution_id = $2 AND role = 'student'", [scopeId, actor.institutionId]);
        if (!rowCount) throw forbidden();
      }
      let previous = null;
      if (policyId) {
        const { rows } = await db.query(
          'SELECT * FROM duty_requirement_policies WHERE id = $1 AND institution_id = $2 FOR UPDATE',
          [policyId, actor.institutionId],
        );
        previous = rows[0];
        if (!previous) throw notFound();
        if (previous.term_id !== input.termId) throw forbidden();
      }
      const values = [
        input.termId, actor.institutionId, input.scopeType, scopeId,
        input.effectiveStartsOn, input.effectiveEndsOn, input.requiredTermHours ?? null,
        input.minimumDailyHours ?? null, input.maximumDailyHours ?? null,
        input.permittedWeekdays, JSON.stringify(input.permittedTimeWindows),
        input.scopeType === 'student' ? input.exceptionReason?.trim() || null : null, actor.id,
      ];
      let row;
      if (policyId) {
        ({ rows: [row] } = await db.query(
          `UPDATE duty_requirement_policies SET
             term_id=$2, scope_type=$3, scope_id=$4, effective_starts_on=$5, effective_ends_on=$6,
             required_term_hours=$7, minimum_daily_hours=$8, maximum_daily_hours=$9, permitted_weekdays=$10,
             permitted_time_windows=$11::jsonb, exception_reason=$12, updated_by=$13
           WHERE id=$1 RETURNING *`,
          [policyId, values[0], values[2], values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], actor.id],
        ));
      } else {
        ({ rows: [row] } = await db.query(
          `INSERT INTO duty_requirement_policies
             (term_id, institution_id, scope_type, scope_id, effective_starts_on, effective_ends_on,
             required_term_hours, minimum_daily_hours, maximum_daily_hours, permitted_weekdays, permitted_time_windows,
              exception_reason, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$13) RETURNING *`,
          values,
        ));
      }
      const after = publicPolicy(row);
      await recordAudit({
        actorId: actor.id, action: previous ? 'duty_requirement.policy_updated' : 'duty_requirement.policy_created',
        targetType: 'duty_requirement_policy', targetId: row.id,
        before: previous ? publicPolicy(previous) : null, after: { ...after, exceptionReason: after.exceptionReason }, ip,
      }, db);
      return after;
    });
  } catch (err) {
    if (err.code === '23P01') throw new AppError(409, 'DUTY_POLICY_CONFLICT', 'A duty policy with the same scope already overlaps these effective dates or time windows.');
    if (err.code === '23514') throw new AppError(400, 'VALIDATION_ERROR', 'The duty policy contains invalid dates, weekdays, hours, or time windows.');
    throw err;
  }
}

async function daysFor(scheduleId, db = { query }) {
  const { rows } = await db.query(
    `SELECT weekday, starts_at::text, ends_at::text,
            afternoon_starts_at::text, afternoon_ends_at::text
     FROM student_duty_schedule_days WHERE schedule_id = $1 ORDER BY weekday`,
    [scheduleId],
  );
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    startsAt: timeText(row.starts_at),
    endsAt: timeText(row.ends_at),
    afternoonStartsAt: row.afternoon_starts_at ? timeText(row.afternoon_starts_at) : null,
    afternoonEndsAt: row.afternoon_ends_at ? timeText(row.afternoon_ends_at) : null,
  }));
}

async function scheduleRow(scheduleId, db = { query }, lock = false) {
  const { rows } = await db.query(
    `SELECT s.*, u.full_name AS student_name, u.email AS student_email, o.name AS office_name
     FROM student_duty_schedules s JOIN users u ON u.id = s.student_id
     JOIN offices o ON o.id = s.office_id WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`,
    [scheduleId],
  );
  return rows[0] ?? null;
}

async function latestForStudent(termId, studentId, db = { query }) {
  const { rows } = await db.query(
    `SELECT * FROM student_duty_schedules WHERE term_id = $1 AND student_id = $2 ORDER BY version DESC`,
    [termId, studentId],
  );
  return rows;
}

async function attendanceMonitoring(schedule, days, term, db = { query }) {
  if (!schedule || schedule.status !== 'approved') return null;
  const { rows } = await db.query(
    `SELECT event_type, (recorded_at AT TIME ZONE $4)::date::text AS local_date,
            extract(isodow FROM recorded_at AT TIME ZONE $4)::int AS weekday,
            to_char(recorded_at AT TIME ZONE $4, 'HH24:MI') AS local_time
     FROM attendance_events
     WHERE user_id = $1 AND office_id = $2 AND recorded_at >= $3::date::timestamp AT TIME ZONE $4
       AND recorded_at < ($5::date + 1)::timestamp AT TIME ZONE $4
       AND (recorded_at AT TIME ZONE $4)::date BETWEEN $6::date AND $7::date
     ORDER BY recorded_at`,
    [schedule.student_id, schedule.office_id, schedule.effective_starts_on, term.timezone,
      schedule.effective_ends_on, schedule.effective_starts_on, schedule.effective_ends_on],
  );
  const byDay = new Map(days.map((day) => [day.weekday, day]));
  const outside = rows.filter((event) => {
    const planned = byDay.get(event.weekday);
    return !planned || !dayPeriods(planned).some((period) =>
      event.local_time >= period.startsAt && event.local_time <= period.endsAt);
  });
  return {
    measuredEvents: rows.length,
    outsidePreferenceEvents: outside.length,
    note: 'Preference monitoring only. Early, late, or unplanned scans remain authorized by the office QR and are never rejected for schedule timing.',
  };
}

export async function studentTerms(user) {
  const { rows: terms } = await query(
    `SELECT id, institution_id, academic_year, semester, starts_on::text, ends_on::text,
            completion_deadline::text, timezone, finalized_at
     FROM academic_terms WHERE institution_id = $1 ORDER BY starts_on DESC`,
    [user.institutionId],
  );
  const result = [];
  for (const term of terms) {
    const versions = await latestForStudent(term.id, user.id);
    const open = versions.find((row) => ['draft', 'pending_review', 'change_requested'].includes(row.status)) ?? null;
    const approved = versions.find((row) => row.status === 'approved') ?? null;
    const displayed = open ?? approved ?? versions[0] ?? null;
    const days = displayed ? await daysFor(displayed.id) : [];
    const requirement = await requirementFor({
      user, term, officeId: user.office?.id,
      startsOn: displayed?.effective_starts_on ?? term.starts_on,
      endsOn: displayed?.effective_ends_on ?? term.ends_on,
    });
    const approvedDays = approved ? await daysFor(approved.id) : [];
    const verifiedHours = await verifiedTermHours(user.id, term);
    const scheduleDays = displayed ? days : [];
    const scheduleDates = displayed ?? { effective_starts_on: term.starts_on, effective_ends_on: term.ends_on };
    const issues = scheduleIssues(scheduleDays, requirement);
    result.push({
      term: requirement.term,
      requirement,
      proposal: displayed ? publicSchedule(displayed, days) : null,
      approvedSchedule: approved ? publicSchedule(approved, approvedDays) : null,
      attendanceMonitoring: approved ? await attendanceMonitoring(approved, approvedDays, term) : null,
      feasibility: estimateFeasibility({ days: scheduleDays, schedule: scheduleDates, requirement, verifiedHours, validationIssues: issues, today: await localToday(term.timezone) }),
      validationIssues: issues,
    });
  }
  return result;
}

async function localToday(timezone, db = { query }) {
  const { rows: [row] } = await db.query("SELECT (now() AT TIME ZONE $1)::date::text AS today", [timezone]);
  return row.today;
}

async function verifiedTermHours(studentId, term, db = { query }) {
  const { rows } = await db.query(
    `SELECT d.status, rv.snapshot
     FROM monthly_dtrs d
     JOIN dtr_revisions rv ON rv.dtr_id = d.id AND rv.revision_no = d.verified_revision
     WHERE d.user_id = $1 AND d.status = 'approved'
       AND d.month >= to_char($2::date, 'YYYY-MM') AND d.month <= to_char($3::date, 'YYYY-MM')`,
    [studentId, term.starts_on, term.ends_on],
  );
  return Math.round(verifiedSecondsForTerm(rows, term.starts_on, term.ends_on, term.timezone) / 36) / 100;
}

function estimateFeasibility({ days, schedule, requirement, verifiedHours, validationIssues, today }) {
  const deadline = requirement.completionDeadline ?? requirement.term.endsOn;
  const start = [schedule.effective_starts_on, today].sort().at(-1);
  const end = [schedule.effective_ends_on, deadline].sort()[0];
  const validDays = days.filter((day) => !scheduleIssues([day], requirement).length);
  const validByWeekday = new Map(validDays.map((day) => [day.weekday, day]));
  let capacityHours = 0;
  let eligibleOccurrences = 0;
  let cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    const weekday = ((cursor.getUTCDay() + 6) % 7) + 1;
    const day = validByWeekday.get(weekday);
    if (day) {
      capacityHours += dayHours(day);
      eligibleOccurrences += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const requiredHours = requirement.requiredTermHours;
  const remainingHours = requiredHours == null ? null : Math.max(0, requiredHours - verifiedHours);
  const weeklyHours = [...validByWeekday.values()].reduce((sum, day) => sum + dayHours(day), 0);
  const feasible = remainingHours != null && validationIssues.length === 0 && capacityHours >= remainingHours;
  const shortfallHours = remainingHours == null ? null : Math.max(0, remainingHours - capacityHours);
  const selected = new Set(days.map((day) => day.weekday));
  const addableDays = requirement.permittedWeekdays.filter((weekday) => weekday <= 6 && !selected.has(weekday));
  const messages = [];
  if (requiredHours == null) messages.push('A total term-hour requirement is not assigned, so feasibility cannot be estimated.');
  else if (!days.length) messages.push('Add a proposed schedule to estimate its capacity before the completion deadline.');
  else if (validationIssues.length) messages.push('Correct the policy validation issues before relying on this estimate.');
  else if (feasible) messages.push(`At the proposed times, the schedule has an estimated capacity of ${capacityHours.toFixed(2)} hours before the deadline, compared with ${remainingHours.toFixed(2)} hours remaining.`);
  else if (shortfallHours != null) {
    messages.push(`The selected preferences provide about ${capacityHours.toFixed(2)} hours before the deadline, leaving an estimated ${shortfallHours.toFixed(2)} hour shortfall.`);
    if (addableDays.length) messages.push(`Consider adding permitted ${addableDays.map((day) => ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day - 1]).join(', ')} duty days.`);
    else if (requirement.maximumDailyHours == null || days.some((day) => dayHours(day) < requirement.maximumDailyHours)) {
      messages.push('Consider extending selected duty periods within the permitted windows and daily maximum.');
    }
  }
  return {
    status: requiredHours == null ? 'requirement_missing' : !days.length ? 'schedule_missing' : validationIssues.length ? 'invalid_schedule' : feasible ? 'capacity_sufficient' : 'capacity_shortfall',
    feasible,
    requiredHours,
    verifiedHours,
    remainingHours,
    estimatedCapacityHours: Math.round(capacityHours * 100) / 100,
    estimatedShortfallHours: shortfallHours == null ? null : Math.round(shortfallHours * 100) / 100,
    weeklyHours: Math.round(weeklyHours * 100) / 100,
    eligibleOccurrences,
    deadline,
    validationIssues,
    guidance: messages,
    note: 'Capacity estimate assumes every valid proposed period is worked and credited at its term-local wall-clock duration. It is advisory, does not account for individual attendance or daylight-saving adjustments, and never approves a schedule or changes attendance records.',
  };
}

async function potentialScheduleConflicts(schedule, days, db = { query }) {
  if (!days.length) return [];
  const { rows } = await db.query(
    `SELECT s.id, s.student_id, s.effective_starts_on::text, s.effective_ends_on::text,
            u.full_name AS student_name, d.weekday, d.starts_at::text, d.ends_at::text,
            d.afternoon_starts_at::text, d.afternoon_ends_at::text
     FROM student_duty_schedules s
     JOIN student_duty_schedule_days d ON d.schedule_id = s.id
     JOIN users u ON u.id = s.student_id
     WHERE s.office_id = $1 AND s.institution_id = $2 AND s.student_id <> $3
       AND s.status = 'approved'
       AND daterange(s.effective_starts_on, s.effective_ends_on, '[]')
           && daterange($4::date, $5::date, '[]')`,
    [schedule.office_id, schedule.institution_id, schedule.student_id, schedule.effective_starts_on, schedule.effective_ends_on],
  );
  const candidate = new Map(days.map((day) => [day.weekday, day]));
  return rows.flatMap((row) => {
    const proposed = candidate.get(Number(row.weekday));
    if (!proposed) return [];
    const existingDay = {
      startsAt: timeText(row.starts_at), endsAt: timeText(row.ends_at),
      afternoonStartsAt: row.afternoon_starts_at ? timeText(row.afternoon_starts_at) : null,
      afternoonEndsAt: row.afternoon_ends_at ? timeText(row.afternoon_ends_at) : null,
    };
    return dayPeriods(proposed).flatMap((proposalPeriod) => dayPeriods(existingDay)
      .filter((existingPeriod) => proposalPeriod.startsAt < existingPeriod.endsAt && existingPeriod.startsAt < proposalPeriod.endsAt)
      .map((existingPeriod) => ({
        studentName: row.student_name,
        weekday: Number(row.weekday),
        startsAt: existingPeriod.startsAt,
        endsAt: existingPeriod.endsAt,
        note: 'Overlaps another approved preference in this office. Confirm office capacity and coordinate; this is not an attendance restriction.',
      })));
  });
}

export async function createDraft({ user, termId, effectiveStartsOn, effectiveEndsOn, days = [], ip }) {
  return withTransaction(async (db) => {
    const term = await termFor(termId, user.institutionId, db);
    if (term.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'Schedules cannot be changed for a finalized term.');
    if (!user.office?.id) throw new AppError(403, 'NOT_ASSIGNED', 'You must be assigned to an office before proposing a schedule.');
    if (effectiveStartsOn < term.starts_on || effectiveEndsOn > term.ends_on || effectiveStartsOn > effectiveEndsOn) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Schedule dates must be within the selected term and ordered correctly.');
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`duty-schedule:${termId}:${user.id}`]);
    const versions = await latestForStudent(termId, user.id, db);
    if (versions.some((row) => ['draft', 'pending_review', 'change_requested'].includes(row.status))) {
      throw new AppError(409, 'SCHEDULE_ALREADY_OPEN', 'Finish or resubmit your current schedule proposal before starting another.');
    }
    const approved = versions.find((row) => row.status === 'approved');
    const version = (versions[0]?.version ?? 0) + 1;
    const { rows: [row] } = await db.query(
      `INSERT INTO student_duty_schedules
         (institution_id, term_id, student_id, office_id, version, request_kind, status,
          effective_starts_on, effective_ends_on)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8) RETURNING *`,
      [user.institutionId, termId, user.id, user.office.id, version, approved ? 'change' : 'initial', effectiveStartsOn, effectiveEndsOn],
    );
    for (const day of days) {
      await db.query(
        `INSERT INTO student_duty_schedule_days
           (schedule_id, weekday, starts_at, ends_at, afternoon_starts_at, afternoon_ends_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.id, day.weekday, day.startsAt, day.endsAt, day.afternoonStartsAt ?? null, day.afternoonEndsAt ?? null],
      );
    }
    await recordAudit({
      actorId: user.id, action: approved ? 'duty_schedule.change_draft_created' : 'duty_schedule.draft_created',
      targetType: 'student_duty_schedule', targetId: row.id,
      after: { termId, officeId: user.office.id, version, requestKind: row.request_kind, effectiveStartsOn, effectiveEndsOn }, ip,
    }, db);
    return publicSchedule(row, await daysFor(row.id, db));
  });
}

export async function updateDraft({ user, scheduleId, effectiveStartsOn, effectiveEndsOn, days, ip }) {
  return withTransaction(async (db) => {
    const row = await scheduleRow(scheduleId, db, true);
    if (!row || row.student_id !== user.id || row.institution_id !== user.institutionId) throw notFound();
    if (!['draft', 'rejected', 'change_requested'].includes(row.status)) {
      throw new AppError(409, 'SCHEDULE_LOCKED', 'Only a draft or returned schedule can be edited.');
    }
    const term = await termFor(row.term_id, user.institutionId, db);
    if (term.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'Schedules cannot be changed for a finalized term.');
    if (effectiveStartsOn < term.starts_on || effectiveEndsOn > term.ends_on || effectiveStartsOn > effectiveEndsOn) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Schedule dates must be within the selected term and ordered correctly.');
    }
    const beforeDays = await daysFor(scheduleId, db);
    const before = { status: row.status, effectiveStartsOn: row.effective_starts_on, effectiveEndsOn: row.effective_ends_on, days: beforeDays, suggestedDays: row.suggested_days ?? [] };
    await db.query('DELETE FROM student_duty_schedule_days WHERE schedule_id = $1', [scheduleId]);
    for (const day of days) {
      await db.query(
        `INSERT INTO student_duty_schedule_days
           (schedule_id, weekday, starts_at, ends_at, afternoon_starts_at, afternoon_ends_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [scheduleId, day.weekday, day.startsAt, day.endsAt, day.afternoonStartsAt ?? null, day.afternoonEndsAt ?? null],
      );
    }
    await db.query(
      `UPDATE student_duty_schedules SET status='draft', effective_starts_on=$2, effective_ends_on=$3,
         review_reason=NULL, reviewed_by=NULL, reviewed_at=NULL, suggested_days='[]'::jsonb WHERE id=$1`,
      [scheduleId, effectiveStartsOn, effectiveEndsOn],
    );
    const updated = await scheduleRow(scheduleId, db);
    const afterDays = await daysFor(scheduleId, db);
    await recordAudit({
      actorId: user.id, action: 'duty_schedule.draft_updated', targetType: 'student_duty_schedule', targetId: scheduleId,
      before, after: { ...before, status: updated.status, effectiveStartsOn, effectiveEndsOn, days: afterDays, suggestedDays: updated.suggested_days ?? [] }, ip,
    }, db);
    return publicSchedule(updated, afterDays);
  });
}

export async function submitSchedule({ user, scheduleId, ip }) {
  return withTransaction(async (db) => {
    const row = await scheduleRow(scheduleId, db, true);
    if (!row || row.student_id !== user.id || row.institution_id !== user.institutionId) throw notFound();
    if (!['draft', 'rejected', 'change_requested'].includes(row.status)) {
      throw new AppError(409, 'SCHEDULE_LOCKED', 'This schedule is not ready for submission.');
    }
    const term = await termFor(row.term_id, user.institutionId, db);
    if (term.finalized_at) throw new AppError(409, 'TERM_FINALIZED', 'Schedules cannot be submitted for a finalized term.');
    const days = await daysFor(scheduleId, db);
    const requirement = await requirementFor({
      user, term, officeId: row.office_id,
      startsOn: row.effective_starts_on, endsOn: row.effective_ends_on, db,
    });
    const issues = scheduleIssues(days, requirement);
    if (issues.length) throw new AppError(400, 'SCHEDULE_VALIDATION_FAILED', issues.map((issue) => issue.message).join(' '), { issues });
    const { rows: [submitted] } = await db.query(
      `UPDATE student_duty_schedules SET status='pending_review', submitted_at=now(),
         reviewed_by=NULL, reviewed_at=NULL, review_reason=NULL, suggested_days='[]'::jsonb WHERE id=$1 RETURNING *`, [scheduleId],
    );
    await recordAudit({
      actorId: user.id, action: 'duty_schedule.submitted', targetType: 'student_duty_schedule', targetId: scheduleId,
      before: { status: row.status }, after: { status: submitted.status, version: row.version, requestKind: row.request_kind }, ip,
    }, db);
    return publicSchedule(submitted, days);
  });
}

export async function reviewQueue({ actor, termId }) {
  if (actor.role === 'supervisor' && !actor.office?.id) return [];
  const params = [actor.institutionId];
  const where = ['s.institution_id = $1', "s.status = 'pending_review'"];
  if (actor.role === 'supervisor') {
    params.push(actor.office.id);
    where.push(`s.office_id = $${params.length}`);
  }
  if (termId) {
    params.push(termId);
    where.push(`s.term_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT s.*, u.full_name AS student_name, u.email AS student_email, o.name AS office_name
     FROM student_duty_schedules s JOIN users u ON u.id=s.student_id JOIN offices o ON o.id=s.office_id
     WHERE ${where.join(' AND ')} ORDER BY s.submitted_at, s.created_at`, params,
  );
  const out = [];
  for (const row of rows) {
    const days = await daysFor(row.id);
    const term = await termFor(row.term_id, actor.institutionId);
    const requirement = await requirementFor({
      user: { id: row.student_id, institutionId: row.institution_id },
      term, officeId: row.office_id, startsOn: row.effective_starts_on, endsOn: row.effective_ends_on,
    });
    const verifiedHours = await verifiedTermHours(row.student_id, term);
    const validationIssues = scheduleIssues(days, requirement);
    const today = await localToday(term.timezone);
    out.push({
      ...publicSchedule(row, days),
      requirement,
      feasibility: estimateFeasibility({ days, schedule: row, requirement, verifiedHours, validationIssues, today }),
      potentialConflicts: await potentialScheduleConflicts(row, days),
    });
  }
  return out;
}

export async function decideSchedule({ actor, scheduleId, decision, reason, suggestedDays = [], ip }) {
  return withTransaction(async (db) => {
    const row = await scheduleRow(scheduleId, db, true);
    if (!row || row.institution_id !== actor.institutionId) throw notFound();
    if (actor.role === 'supervisor' && actor.office?.id !== row.office_id) throw forbidden();
    if (actor.role !== 'admin' && actor.role !== 'supervisor') throw forbidden();
    if (row.status !== 'pending_review') throw new AppError(409, 'SCHEDULE_NOT_PENDING', 'Only a pending schedule can be reviewed.');
    if (row.student_id === actor.id) throw forbidden();
    if (decision !== 'approve' && !reason?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A reason is required when rejecting or requesting changes.');
    }
    if (suggestedDays.length && decision !== 'request_changes') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Suggested duty times can only accompany a revision request.');
    }
    if (suggestedDays.length) {
      const term = await termFor(row.term_id, actor.institutionId, db);
      const requirement = await requirementFor({
        user: { id: row.student_id, institutionId: row.institution_id }, term,
        officeId: row.office_id, startsOn: row.effective_starts_on, endsOn: row.effective_ends_on, db,
      });
      const suggestionIssues = scheduleIssues(suggestedDays, requirement);
      if (suggestionIssues.length) throw new AppError(400, 'INVALID_SCHEDULE_SUGGESTION', suggestionIssues.map((issue) => issue.message).join(' '), { issues: suggestionIssues });
    }
    const next = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'change_requested';
    const { rows: [updated] } = await db.query(
      `UPDATE student_duty_schedules SET status=$2, reviewed_by=$3, reviewed_at=now(), review_reason=$4, suggested_days=$5::jsonb
       WHERE id=$1 RETURNING *`, [scheduleId, next, actor.id, reason?.trim() || null, JSON.stringify(suggestedDays)],
    );
    await recordAudit({
      actorId: actor.id, action: `duty_schedule.${decision === 'request_changes' ? 'changes_requested' : decision === 'approve' ? 'approved' : 'rejected'}`,
      targetType: 'student_duty_schedule', targetId: scheduleId,
      before: { status: row.status, suggestedDays: row.suggested_days ?? [] },
      after: { status: updated.status, reason: updated.review_reason, suggestedDays: updated.suggested_days, studentId: row.student_id, officeId: row.office_id, version: row.version }, ip,
    }, db);
    return publicSchedule(updated, await daysFor(scheduleId, db));
  });
}

export async function supervisorScheduleDetail({ actor, scheduleId }) {
  const row = await scheduleRow(scheduleId);
  if (!row || row.institution_id !== actor.institutionId) throw notFound();
  if (actor.role === 'supervisor' && actor.office?.id !== row.office_id) throw forbidden();
  if (actor.role !== 'admin' && actor.role !== 'supervisor') throw forbidden();
  return publicSchedule(row, await daysFor(scheduleId));
}
