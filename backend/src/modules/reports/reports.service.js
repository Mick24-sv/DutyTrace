import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { buildSessions, summarizeMonth, localDateKey, STATUS } from '../attendance/calc.js';
import { isMonth } from '../attendance/attendance.service.js';

const maxSessionSeconds = () => env.maxSessionHours * 3600;

// Resolve month boundaries in the server timezone
export async function resolveMonthRange(requested) {
  const { rows } = await query(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS current_month, now() AS db_now`,
    [env.timezone],
  );
  const month = requested && isMonth(requested) ? requested : rows[0].current_month;
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { month, startDate: `${month}-01`, nextDate: `${next}-01`, now: rows[0].db_now };
}

// Fetch active required monthly hours from policy settings
export async function getRequiredHours() {
  const { rows } = await query('SELECT required_monthly_hours FROM policy_settings WHERE id = true');
  return Number(rows[0]?.required_monthly_hours ?? 40);
}

// Helper to check and enforce office scope for supervisor
export function enforceOfficeScope(user, requestedOfficeId) {
  if (user.role === 'supervisor') {
    if (!user.office?.id) {
      throw new AppError(403, 'FORBIDDEN', 'You are not assigned to an office.');
    }
    if (requestedOfficeId && requestedOfficeId !== user.office.id) {
      throw new AppError(403, 'FORBIDDEN', 'You may only view reports for your own office.');
    }
    return user.office.id;
  }
  return requestedOfficeId || null;
}

// Helper to paginate an array
export function paginateArray(items, page = 1, limit = 20) {
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / lim));
  const start = (p - 1) * lim;
  const paginated = items.slice(start, start + lim);
  return {
    items: paginated,
    pagination: {
      page: p,
      limit: lim,
      total,
      totalPages,
    },
  };
}

// -----------------------------------------------------------------------------------------
// 1. Attendance Report (Detailed sessions by student and office)
// -----------------------------------------------------------------------------------------
export async function attendanceReport({ user, officeId, userId, from, to, month, page, limit }) {
  const effectiveOfficeId = enforceOfficeScope(user, officeId);
  const monthRange = await resolveMonthRange(month);

  let dateStart = from;
  let dateEnd = to;
  if (!dateStart && !dateEnd) {
    dateStart = monthRange.startDate;
    // Calculate last day of the month
    const [y, m] = monthRange.month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    dateEnd = `${monthRange.month}-${String(lastDay).padStart(2, '0')}`;
  } else {
    dateStart = dateStart || monthRange.startDate;
    dateEnd = dateEnd || dateStart;
  }

  // Find target students
  const userParams = [];
  const userWhere = [`u.role = 'student'`];

  if (effectiveOfficeId) {
    userParams.push(effectiveOfficeId);
    userWhere.push(`d.office_id = $${userParams.length} AND d.ends_on IS NULL`);
  }
  if (userId) {
    userParams.push(userId);
    userWhere.push(`u.id = $${userParams.length}`);
  }

  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email, o.id AS office_id, o.code AS office_code, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE ${userWhere.join(' AND ')}
     ORDER BY o.name NULLS LAST, u.full_name`,
    userParams,
  );

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const studentIds = students.map((s) => s.id);

  if (studentIds.length === 0) {
    return {
      summary: { totalSessions: 0, countedSessions: 0, recordedHours: 0, incompleteCount: 0 },
      ...paginateArray([], page, limit),
      filters: { officeId: effectiveOfficeId, userId, from: dateStart, to: dateEnd, month: monthRange.month },
    };
  }

  // Fetch events covering the date window plus 2 days for midnight crossings
  const { rows: events } = await query(
    `SELECT e.user_id, e.id, e.event_type, e.recorded_at, o.id AS office_id, o.name AS office_name, o.code AS office_code
     FROM attendance_events e
     JOIN offices o ON o.id = e.office_id
     WHERE e.user_id = ANY($1::uuid[])
       AND e.recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
       AND e.recorded_at <  (($3::date + 2)::timestamp AT TIME ZONE $4)
     ORDER BY e.user_id, e.recorded_at, e.seq`,
    [studentIds, dateStart, dateEnd, env.timezone],
  );

  const eventsByUser = new Map(studentIds.map((id) => [id, []]));
  for (const ev of events) {
    eventsByUser.get(ev.user_id)?.push({
      id: ev.id,
      eventType: ev.event_type,
      recordedAt: ev.recorded_at,
      officeId: ev.office_id,
      officeName: ev.office_name,
    });
  }

  // Build sessions per student using standard calc logic
  const allSessions = [];
  let totalCountedSeconds = 0;
  let totalIncomplete = 0;
  let totalCountedSessions = 0;

  for (const student of students) {
    const userEvents = eventsByUser.get(student.id) || [];
    const sessions = buildSessions(userEvents, {
      now: monthRange.now,
      timeZone: env.timezone,
      maxSessionSeconds: maxSessionSeconds(),
    });

    for (const s of sessions) {
      // Filter by the requested date range
      if (s.date >= dateStart && s.date <= dateEnd) {
        const recordedHours = s.counted && s.seconds ? Math.round((s.seconds / 3600) * 100) / 100 : 0;
        if (s.counted && s.seconds) {
          totalCountedSeconds += s.seconds;
          totalCountedSessions++;
        }
        if (!s.counted && s.status !== STATUS.IN_PROGRESS) {
          totalIncomplete++;
        }

        allSessions.push({
          id: s.id,
          date: s.date,
          studentId: student.id,
          studentName: student.full_name,
          studentEmail: student.email,
          officeId: student.office_id,
          officeName: student.office_name || '—',
          officeCode: student.office_code || '—',
          timeIn: s.timeIn,
          timeOut: s.timeOut,
          durationSeconds: s.seconds,
          recordedHours,
          status: s.status,
          counted: s.counted,
          flags: s.flags || [],
        });
      }
    }
  }

  // Sort descending by date, then time
  allSessions.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.timeIn || '').localeCompare(a.timeIn || '');
  });

  const totalRecordedHours = Math.round((totalCountedSeconds / 3600) * 100) / 100;
  const paginated = paginateArray(allSessions, page, limit);

  return {
    summary: {
      totalSessions: allSessions.length,
      countedSessions: totalCountedSessions,
      recordedHours: totalRecordedHours,
      incompleteCount: totalIncomplete,
    },
    ...paginated,
    filters: { officeId: effectiveOfficeId, userId, from: dateStart, to: dateEnd, month: monthRange.month },
  };
}

export const attendanceCsvColumns = [
  { header: 'Date', key: 'date' },
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'Time In', key: 'timeIn' },
  { header: 'Time Out', key: 'timeOut' },
  { header: 'Duration (Hours)', key: 'recordedHours' },
  { header: 'Status', key: 'status' },
  { header: 'Counted in Hours', format: (r) => (r.counted ? 'Yes' : 'No') },
  { header: 'Flags', format: (r) => (r.flags && r.flags.length ? r.flags.join('; ') : 'None') },
];

// -----------------------------------------------------------------------------------------
// 2. Recorded vs. Verified Hours Report
// -----------------------------------------------------------------------------------------
export async function hoursReport({ user, officeId, month, page, limit }) {
  const effectiveOfficeId = enforceOfficeScope(user, officeId);
  const monthRange = await resolveMonthRange(month);
  const requiredHours = await getRequiredHours();

  // Find active student assistants
  const params = [];
  let where = `u.role = 'student' AND u.status = 'active'`;
  if (effectiveOfficeId) {
    params.push(effectiveOfficeId);
    where += ` AND d.office_id = $${params.length} AND d.ends_on IS NULL`;
  }

  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email, o.id AS office_id, o.code AS office_code, o.name AS office_name
     FROM users u
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE ${where}
     ORDER BY o.name NULLS LAST, u.full_name`,
    params,
  );

  const studentIds = students.map((s) => s.id);

  if (studentIds.length === 0) {
    return {
      summary: {
        totalStudents: 0,
        totalRecordedHours: 0,
        totalVerifiedHours: 0,
        totalRequiredHours: 0,
        studentsMetRequirement: 0,
        studentsBelowRequirement: 0,
      },
      ...paginateArray([], page, limit),
      filters: { officeId: effectiveOfficeId, month: monthRange.month },
    };
  }

  // Fetch events for students
  const { rows: events } = await query(
    `SELECT user_id, id, event_type, recorded_at FROM attendance_events
     WHERE user_id = ANY($1::uuid[])
       AND recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
       AND recorded_at <  (($3::date + 2)::timestamp AT TIME ZONE $4)
     ORDER BY user_id, recorded_at, seq`,
    [studentIds, monthRange.startDate, monthRange.nextDate, env.timezone],
  );

  const eventsByUser = new Map(studentIds.map((id) => [id, []]));
  for (const ev of events) {
    eventsByUser.get(ev.user_id)?.push({ id: ev.id, eventType: ev.event_type, recordedAt: ev.recorded_at });
  }

  // Fetch monthly DTRs for verified hours and status
  const { rows: dtrs } = await query(
    `SELECT user_id, status, verified_seconds FROM monthly_dtrs
     WHERE user_id = ANY($1::uuid[]) AND month = $2`,
    [studentIds, monthRange.month],
  );
  const dtrByUser = new Map(dtrs.map((d) => [d.user_id, d]));

  let totalRecordedSeconds = 0;
  let totalVerifiedSeconds = 0;
  let metCount = 0;
  let belowCount = 0;

  const rows = students.map((s) => {
    const userEvents = eventsByUser.get(s.id) || [];
    const sessions = buildSessions(userEvents, {
      now: monthRange.now,
      timeZone: env.timezone,
      maxSessionSeconds: maxSessionSeconds(),
    });
    const summary = summarizeMonth(sessions, monthRange.month);
    const recordedHours = summary.totals.recordedHours;
    totalRecordedSeconds += summary.totals.recordedSeconds;

    const dtr = dtrByUser.get(s.id);
    const isApproved = dtr?.status === 'approved';
    const verifiedSecs = isApproved && dtr.verified_seconds != null ? dtr.verified_seconds : 0;
    const verifiedHours = Math.round((verifiedSecs / 3600) * 100) / 100;
    if (isApproved) {
      totalVerifiedSeconds += verifiedSecs;
    }

    const remainingHours = Math.max(0, Math.round((requiredHours - recordedHours) * 100) / 100);
    const variance = Math.round((recordedHours - verifiedHours) * 100) / 100;
    const meetsRequirement = recordedHours >= requiredHours;

    if (meetsRequirement) metCount++;
    else belowCount++;

    return {
      id: s.id,
      studentName: s.full_name,
      studentEmail: s.email,
      officeId: s.office_id,
      officeName: s.office_name || '—',
      officeCode: s.office_code || '—',
      month: monthRange.month,
      requiredHours,
      recordedHours,
      verifiedHours,
      remainingHours,
      variance,
      meetsRequirement,
      dtrStatus: dtr?.status || 'none',
      incompleteSessions: summary.totals.incompleteCount,
    };
  });

  const totalRecordedHours = Math.round((totalRecordedSeconds / 3600) * 100) / 100;
  const totalVerifiedHours = Math.round((totalVerifiedSeconds / 3600) * 100) / 100;
  const totalRequiredHours = students.length * requiredHours;

  return {
    summary: {
      totalStudents: students.length,
      totalRecordedHours,
      totalVerifiedHours,
      totalRequiredHours,
      studentsMetRequirement: metCount,
      studentsBelowRequirement: belowCount,
    },
    ...paginateArray(rows, page, limit),
    filters: { officeId: effectiveOfficeId, month: monthRange.month },
  };
}

export const hoursCsvColumns = [
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'Month', key: 'month' },
  { header: 'Required Hours', key: 'requiredHours' },
  { header: 'Recorded Hours', key: 'recordedHours' },
  { header: 'Verified Hours', key: 'verifiedHours' },
  { header: 'Remaining Hours', key: 'remainingHours' },
  { header: 'Variance (Unverified)', key: 'variance' },
  { header: 'Meets Requirement', format: (r) => (r.meetsRequirement ? 'Yes' : 'No') },
  { header: 'DTR Status', key: 'dtrStatus' },
];

// -----------------------------------------------------------------------------------------
// 3. Monthly DTR Status Report
// -----------------------------------------------------------------------------------------
export async function dtrReport({ user, officeId, month, status, page, limit }) {
  const effectiveOfficeId = enforceOfficeScope(user, officeId);
  const params = [];
  const where = [];

  if (effectiveOfficeId) {
    params.push(effectiveOfficeId);
    where.push(`d.office_id = $${params.length}`);
  }
  if (month && isMonth(month)) {
    params.push(month);
    where.push(`d.month = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`d.status = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT d.id, d.month, d.status, d.current_revision, d.verified_seconds,
            d.decided_at, d.created_at, d.updated_at,
            u.id AS user_id, u.full_name AS student_name, u.email AS student_email,
            o.id AS office_id, o.code AS office_code, o.name AS office_name,
            dec.full_name AS decided_by_name,
            (SELECT snapshot->'totals'->>'recordedHours' FROM dtr_revisions r WHERE r.dtr_id = d.id AND r.revision_no = d.current_revision) AS recorded_hours,
            (SELECT min(e.created_at) FROM dtr_events e WHERE e.dtr_id = d.id AND e.action = 'submitted') AS submitted_at
     FROM monthly_dtrs d
     JOIN users u ON u.id = d.user_id
     JOIN offices o ON o.id = d.office_id
     LEFT JOIN users dec ON dec.id = d.decided_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY d.month DESC, o.name, u.full_name`,
    params,
  );

  const statusCounts = { draft: 0, submitted: 0, under_review: 0, approved: 0, needs_correction: 0 };
  const items = rows.map((r) => {
    if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    const recHours = Number(r.recorded_hours || 0);
    const verHours = r.verified_seconds != null ? Math.round((r.verified_seconds / 3600) * 100) / 100 : 0;

    return {
      id: r.id,
      month: r.month,
      status: r.status,
      currentRevision: r.current_revision,
      recordedHours: recHours,
      verifiedHours: verHours,
      studentName: r.student_name,
      studentEmail: r.student_email,
      officeName: r.office_name,
      officeCode: r.office_code,
      decidedBy: r.decided_by_name || '—',
      decidedAt: r.decided_at,
      submittedAt: r.submitted_at,
    };
  });

  return {
    summary: {
      total: items.length,
      ...statusCounts,
      pendingReview: statusCounts.submitted + statusCounts.under_review,
    },
    ...paginateArray(items, page, limit),
    filters: { officeId: effectiveOfficeId, month, status },
  };
}

export const dtrCsvColumns = [
  { header: 'Month', key: 'month' },
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'DTR Status', key: 'status' },
  { header: 'Revision', key: 'currentRevision' },
  { header: 'Recorded Hours', key: 'recordedHours' },
  { header: 'Verified Hours', key: 'verifiedHours' },
  { header: 'Decided By', key: 'decidedBy' },
  { header: 'Decided At', key: 'decidedAt' },
  { header: 'Submitted At', key: 'submittedAt' },
];

// -----------------------------------------------------------------------------------------
// 4. Outstanding Duty-Hour Requirements Report
// -----------------------------------------------------------------------------------------
export async function outstandingRequirementsReport({ user, officeId, month, page, limit }) {
  const allHours = await hoursReport({ user, officeId, month, page: 1, limit: 10000 });
  const belowRequirements = allHours.items.filter((r) => !r.meetsRequirement);

  const totalShortfall = belowRequirements.reduce((sum, r) => sum + r.remainingHours, 0);

  return {
    summary: {
      totalStudentsBelow: belowRequirements.length,
      totalShortfallHours: Math.round(totalShortfall * 100) / 100,
      requiredMonthlyHours: allHours.items[0]?.requiredHours ?? 40,
    },
    ...paginateArray(belowRequirements, page, limit),
    filters: allHours.filters,
  };
}

export const outstandingCsvColumns = [
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'Month', key: 'month' },
  { header: 'Required Hours', key: 'requiredHours' },
  { header: 'Recorded Hours', key: 'recordedHours' },
  { header: 'Hours Short / Deficit', key: 'remainingHours' },
  { header: 'DTR Status', key: 'dtrStatus' },
];

// -----------------------------------------------------------------------------------------
// 5. Absence Notifications Report
// -----------------------------------------------------------------------------------------
export async function absencesReport({ user, officeId, status, type, from, to, page, limit }) {
  const effectiveOfficeId = enforceOfficeScope(user, officeId);
  const params = [];
  const where = [];

  if (effectiveOfficeId) {
    params.push(effectiveOfficeId);
    where.push(`a.office_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  if (type) {
    params.push(type);
    where.push(`a.absence_type = $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`a.end_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`a.start_date <= $${params.length}`);
  }

  const { rows } = await query(
    `SELECT a.id, a.absence_type, a.start_date, a.end_date, a.reason, a.status,
            a.response, a.responded_at, a.submitted_at,
            u.id AS user_id, u.full_name AS student_name, u.email AS student_email,
            o.id AS office_id, o.code AS office_code, o.name AS office_name,
            resp.full_name AS responded_by_name,
            (SELECT count(*)::int FROM documents doc WHERE doc.absence_id = a.id) AS document_count
     FROM absence_notices a
     JOIN users u ON u.id = a.user_id
     JOIN offices o ON o.id = a.office_id
     LEFT JOIN users resp ON resp.id = a.responded_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY a.submitted_at DESC`,
    params,
  );

  const statusCounts = { pending: 0, acknowledged: 0, reviewed: 0, needs_follow_up: 0 };
  const typeCounts = { planned: 0, unexpected: 0 };

  const items = rows.map((r) => {
    if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    if (typeCounts[r.absence_type] !== undefined) typeCounts[r.absence_type]++;

    return {
      id: r.id,
      absenceType: r.absence_type,
      startDate: r.start_date,
      endDate: r.end_date,
      reason: r.reason,
      status: r.status,
      response: r.response,
      respondedBy: r.responded_by_name || '—',
      respondedAt: r.responded_at,
      submittedAt: r.submitted_at,
      studentName: r.student_name,
      studentEmail: r.student_email,
      officeName: r.office_name,
      officeCode: r.office_code,
      documentCount: r.document_count,
    };
  });

  return {
    summary: {
      total: items.length,
      ...statusCounts,
      requiresAttention: statusCounts.pending + statusCounts.needs_follow_up,
      byType: typeCounts,
    },
    ...paginateArray(items, page, limit),
    filters: { officeId: effectiveOfficeId, status, type, from, to },
  };
}

export const absencesCsvColumns = [
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'Type', key: 'absenceType' },
  { header: 'Start Date', key: 'startDate' },
  { header: 'End Date', key: 'endDate' },
  { header: 'Reason', key: 'reason' },
  { header: 'Status', key: 'status' },
  { header: 'Documents Attached', key: 'documentCount' },
  { header: 'Responded By', key: 'respondedBy' },
  { header: 'Responded At', key: 'respondedAt' },
  { header: 'Submitted At', key: 'submittedAt' },
];

// -----------------------------------------------------------------------------------------
// 6. Compliance Cases Report
// -----------------------------------------------------------------------------------------
export async function casesReport({ user, officeId, status, caseTypeId, from, to, page, limit }) {
  const effectiveOfficeId = enforceOfficeScope(user, officeId);
  const params = [];
  const where = [];

  if (effectiveOfficeId) {
    params.push(effectiveOfficeId);
    where.push(`c.office_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (caseTypeId) {
    params.push(caseTypeId);
    where.push(`c.case_type_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`c.period_end >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`c.period_start <= $${params.length}`);
  }

  const { rows } = await query(
    `SELECT c.id, c.reference, c.description, c.period_start, c.period_end, c.status,
            c.decision, c.resolution_date, c.resolved_at, c.created_at,
            u.id AS user_id, u.full_name AS student_name, u.email AS student_email,
            o.id AS office_id, o.code AS office_code, o.name AS office_name,
            t.id AS case_type_id, t.code AS type_code, t.name AS type_name,
            res.full_name AS resolved_by_name,
            (SELECT count(*)::int FROM case_requirements cr
             WHERE cr.case_id = c.id AND cr.is_required = true AND cr.waived_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.requirement_id = cr.id)) AS missing_requirements_count
     FROM compliance_cases c
     JOIN users u ON u.id = c.user_id
     JOIN offices o ON o.id = c.office_id
     JOIN case_types t ON t.id = c.case_type_id
     LEFT JOIN users res ON res.id = c.resolved_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.created_at DESC`,
    params,
  );

  const statusCounts = { open: 0, documents_pending: 0, under_review: 0, needs_correction: 0, resolved: 0, closed: 0 };

  const items = rows.map((r) => {
    if (statusCounts[r.status] !== undefined) statusCounts[r.status]++;
    return {
      id: r.id,
      reference: r.reference,
      description: r.description,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      decision: r.decision || '—',
      resolutionDate: r.resolution_date,
      resolvedBy: r.resolved_by_name || '—',
      createdAt: r.created_at,
      studentName: r.student_name,
      studentEmail: r.student_email,
      officeName: r.office_name,
      officeCode: r.office_code,
      caseTypeName: r.type_name,
      caseTypeCode: r.type_code,
      missingRequirements: r.missing_requirements_count,
    };
  });

  return {
    summary: {
      total: items.length,
      ...statusCounts,
      activeCases: statusCounts.open + statusCounts.documents_pending + statusCounts.under_review + statusCounts.needs_correction,
    },
    ...paginateArray(items, page, limit),
    filters: { officeId: effectiveOfficeId, status, caseTypeId, from, to },
  };
}

export const casesCsvColumns = [
  { header: 'Reference', key: 'reference' },
  { header: 'Student Assistant', key: 'studentName' },
  { header: 'Email', key: 'studentEmail' },
  { header: 'Office', key: 'officeName' },
  { header: 'Case Type', key: 'caseTypeName' },
  { header: 'Period Start', key: 'periodStart' },
  { header: 'Period End', key: 'periodEnd' },
  { header: 'Status', key: 'status' },
  { header: 'Missing Requirements', key: 'missingRequirements' },
  { header: 'Decision / Resolution', key: 'decision' },
  { header: 'Resolved By', key: 'resolvedBy' },
  { header: 'Resolution Date', key: 'resolutionDate' },
  { header: 'Created At', key: 'createdAt' },
];

// -----------------------------------------------------------------------------------------
// 7. Comprehensive Dashboard Stats (Admin & Supervisor)
// -----------------------------------------------------------------------------------------
export async function getDashboardStats(user) {
  const monthRange = await resolveMonthRange();
  const requiredHours = await getRequiredHours();

  if (user.role === 'admin') {
    // 1. Users count by role & status
    const { rows: userStats } = await query(
      `SELECT role, status, count(*)::int AS count FROM users GROUP BY role, status`,
    );
    const totalUsers = userStats.reduce((sum, r) => sum + r.count, 0);
    const activeUsers = userStats.filter((r) => r.status === 'active').reduce((sum, r) => sum + r.count, 0);
    const studentsCount = userStats.filter((r) => r.role === 'student' && r.status === 'active').reduce((sum, r) => sum + r.count, 0);
    const supervisorsCount = userStats.filter((r) => r.role === 'supervisor' && r.status === 'active').reduce((sum, r) => sum + r.count, 0);

    // 2. Offices count
    const { rows: officeStats } = await query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active FROM offices`,
    );

    // 3. Attendance today & active timed-in
    const { rows: timedInRows } = await query(
      `SELECT count(*)::int AS timed_in FROM (
         SELECT DISTINCT ON (user_id) event_type FROM attendance_events
         ORDER BY user_id, recorded_at DESC, seq DESC
       ) last WHERE last.event_type = 'time_in'`,
    );

    // 4. Monthly DTR stats for all-time and current month
    const { rows: dtrRows } = await query(
      `SELECT status, count(*)::int AS count,
              count(*) FILTER (WHERE month = $1)::int AS count_current_month,
              coalesce(sum(verified_seconds) FILTER (WHERE month = $1 AND status = 'approved'), 0)::bigint AS verified_seconds_current_month
       FROM monthly_dtrs GROUP BY status`,
      [monthRange.month],
    );
    const dtrCounts = { draft: 0, submitted: 0, under_review: 0, approved: 0, needs_correction: 0 };
    const dtrCurrentMonthCounts = { draft: 0, submitted: 0, under_review: 0, approved: 0, needs_correction: 0 };
    let currentMonthVerifiedSecs = 0;

    for (const r of dtrRows) {
      if (dtrCounts[r.status] !== undefined) dtrCounts[r.status] = r.count;
      if (dtrCurrentMonthCounts[r.status] !== undefined) dtrCurrentMonthCounts[r.status] = r.count_current_month;
      currentMonthVerifiedSecs += Number(r.verified_seconds_current_month || 0);
    }

    // 5. System recorded vs verified hours for current month
    const hoursData = await hoursReport({ user, month: monthRange.month, page: 1, limit: 10000 });

    // 6. Compliance cases
    const { rows: caseRows } = await query(
      `SELECT status, count(*)::int AS count FROM compliance_cases GROUP BY status`,
    );
    const caseCounts = { open: 0, documents_pending: 0, under_review: 0, needs_correction: 0, resolved: 0, closed: 0 };
    for (const r of caseRows) {
      if (caseCounts[r.status] !== undefined) caseCounts[r.status] = r.count;
    }
    const openCases = caseCounts.open + caseCounts.documents_pending + caseCounts.under_review + caseCounts.needs_correction;

    // 7. Absences
    const { rows: absenceRows } = await query(
      `SELECT status, count(*)::int AS count FROM absence_notices GROUP BY status`,
    );
    const absenceCounts = { pending: 0, acknowledged: 0, reviewed: 0, needs_follow_up: 0 };
    for (const r of absenceRows) {
      if (absenceCounts[r.status] !== undefined) absenceCounts[r.status] = r.count;
    }

    // 8. Documents
    const { rows: docRows } = await query(
      `SELECT method, count(*)::int AS count,
              count(*) FILTER (WHERE absence_id IS NOT NULL)::int AS for_absences,
              count(*) FILTER (WHERE case_id IS NOT NULL)::int AS for_cases
       FROM documents GROUP BY method`,
    );
    const totalDocs = docRows.reduce((sum, r) => sum + r.count, 0);
    const onlineDocs = docRows.find((r) => r.method === 'online')?.count ?? 0;
    const manualDocs = docRows.filter((r) => r.method !== 'online').reduce((sum, r) => sum + r.count, 0);

    return {
      role: 'admin',
      month: monthRange.month,
      users: {
        total: totalUsers,
        active: activeUsers,
        students: studentsCount,
        supervisors: supervisorsCount,
      },
      offices: {
        total: officeStats[0]?.total ?? 0,
        active: officeStats[0]?.active ?? 0,
      },
      attendance: {
        timedInNow: timedInRows[0]?.timed_in ?? 0,
        recordedHoursCurrentMonth: hoursData.summary.totalRecordedHours,
        verifiedHoursCurrentMonth: hoursData.summary.totalVerifiedHours,
      },
      dtrs: {
        allTime: dtrCounts,
        currentMonth: dtrCurrentMonthCounts,
        pendingReview: dtrCounts.submitted + dtrCounts.under_review,
      },
      hoursSummary: {
        requiredMonthlyHours: requiredHours,
        totalRecordedHours: hoursData.summary.totalRecordedHours,
        totalVerifiedHours: hoursData.summary.totalVerifiedHours,
        studentsMetRequirement: hoursData.summary.studentsMetRequirement,
        studentsBelowRequirement: hoursData.summary.studentsBelowRequirement,
      },
      cases: {
        ...caseCounts,
        activeTotal: openCases,
      },
      absences: {
        ...absenceCounts,
        pendingReview: absenceCounts.pending + absenceCounts.needs_follow_up,
      },
      documents: {
        total: totalDocs,
        online: onlineDocs,
        manual: manualDocs,
      },
    };
  }

  // Supervisor Dashboard Stats
  if (user.role === 'supervisor') {
    const officeId = user.office?.id;
    if (!officeId) {
      return {
        role: 'supervisor',
        office: null,
        month: monthRange.month,
        assistants: [],
        stats: {
          totalAssistants: 0,
          timedInToday: 0,
          incompleteSessions: 0,
          pendingDtrs: 0,
          absencesAwaitingReview: 0,
          studentsBelowRequirement: 0,
          openCases: 0,
        },
      };
    }

    // 1. Hours and assistants
    const hoursData = await hoursReport({ user, officeId, month: monthRange.month, page: 1, limit: 1000 });
    const studentsBelow = hoursData.items.filter((r) => !r.meetsRequirement);

    // 2. Today's attendance state for students in office
    const { rows: todayStates } = await query(
      `SELECT u.id, u.full_name, u.email,
              last.event_type, last.recorded_at
       FROM duty_assignments d
       JOIN users u ON u.id = d.user_id AND u.role = 'student' AND u.status = 'active'
       LEFT JOIN LATERAL (
         SELECT event_type, recorded_at FROM attendance_events e
         WHERE e.user_id = u.id ORDER BY recorded_at DESC, seq DESC LIMIT 1
       ) last ON true
       WHERE d.office_id = $1 AND d.ends_on IS NULL
       ORDER BY u.full_name`,
      [officeId],
    );

    let timedInCount = 0;
    const todayList = todayStates.map((s) => {
      const isTimedIn = s.event_type === 'time_in';
      if (isTimedIn) timedInCount++;
      return {
        id: s.id,
        fullName: s.full_name,
        email: s.email,
        state: isTimedIn ? 'timed_in' : 'timed_out',
        since: s.recorded_at,
      };
    });

    // 3. Incomplete sessions count this month
    const totalIncomplete = hoursData.items.reduce((sum, r) => sum + (r.incompleteSessions || 0), 0);

    // 4. Pending DTR reviews
    const { rows: dtrCounts } = await query(
      `SELECT count(*) FILTER (WHERE status IN ('submitted', 'under_review'))::int AS pending
       FROM monthly_dtrs WHERE office_id = $1`,
      [officeId],
    );

    // 5. Absences awaiting attention
    const { rows: absCounts } = await query(
      `SELECT count(*) FILTER (WHERE status IN ('pending', 'needs_follow_up'))::int AS pending
       FROM absence_notices WHERE office_id = $1`,
      [officeId],
    );

    // 6. Open cases requiring attention
    const { rows: caseCounts } = await query(
      `SELECT count(*) FILTER (WHERE status IN ('open', 'documents_pending', 'under_review', 'needs_correction'))::int AS open_cases
       FROM compliance_cases WHERE office_id = $1`,
      [officeId],
    );

    return {
      role: 'supervisor',
      office: user.office,
      month: monthRange.month,
      assistants: hoursData.items,
      todayAttendance: todayList,
      studentsBelowRequirement: studentsBelow,
      stats: {
        totalAssistants: hoursData.items.length,
        timedInToday: timedInCount,
        incompleteSessions: totalIncomplete,
        pendingDtrs: dtrCounts[0]?.pending ?? 0,
        absencesAwaitingReview: absCounts[0]?.pending ?? 0,
        studentsBelowRequirement: studentsBelow.length,
        openCases: caseCounts[0]?.open_cases ?? 0,
      },
    };
  }

  throw new AppError(403, 'FORBIDDEN', 'Role not supported for dashboard stats.');
}

