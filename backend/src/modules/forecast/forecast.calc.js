import { buildSessions, localDateKey } from '../attendance/calc.js';

/**
 * Calculates the wall-clock duration of a single schedule day in hours.
 */
export function scheduleDayHours(day) {
  let total = 0;
  if (day.startsAt && day.endsAt) {
    const [sh, sm] = day.startsAt.split(':').map(Number);
    const [eh, em] = day.endsAt.split(':').map(Number);
    total += Math.max(0, eh + em / 60 - (sh + sm / 60));
  }
  if (day.afternoonStartsAt && day.afternoonEndsAt) {
    const [sh, sm] = day.afternoonStartsAt.split(':').map(Number);
    const [eh, em] = day.afternoonEndsAt.split(':').map(Number);
    total += Math.max(0, eh + em / 60 - (sh + sm / 60));
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculates actual average weekly attendance pace over the historical evaluation window.
 * Only complete, validated attendance sessions are counted (excludes invalid, orphaned,
 * unapproved or overlength sessions).
 *
 * @param {object} opts
 * @param {Array} opts.events - raw attendance_events for the student
 * @param {string} opts.windowStartDate - 'YYYY-MM-DD'
 * @param {string} opts.today - 'YYYY-MM-DD'
 * @param {string} opts.timeZone - IANA timezone
 * @param {number} opts.maxSessionSeconds - session length limit in seconds
 * @param {number} opts.configuredWindowWeeks - configured window in weeks (default 4)
 * @param {Date} opts.now - current Date instant
 */
export function calculateHistoricalAttendancePace({
  events = [],
  windowStartDate,
  today,
  timeZone,
  maxSessionSeconds,
  configuredWindowWeeks = 4,
  now = new Date(),
}) {
  const sessions = buildSessions(events, { now, timeZone, maxSessionSeconds });

  // Filter to valid sessions that started within the historical window [windowStartDate, today]
  const windowSessions = sessions.filter(
    (s) => s.counted && s.date >= windowStartDate && s.date <= today && Number.isFinite(s.seconds),
  );

  const totalHistoricalSeconds = windowSessions.reduce((sum, s) => sum + s.seconds, 0);
  const totalHistoricalHours = Math.round((totalHistoricalSeconds / 3600) * 100) / 100;

  // Track calendar days and distinct active weeks
  const activeDays = new Set(windowSessions.map((s) => s.date));
  const activeWeeks = new Set(
    windowSessions.map((s) => {
      // Bucket by week starting Monday
      const d = new Date(`${s.date}T00:00:00.000Z`);
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - day + 1);
      return d.toISOString().slice(0, 10);
    }),
  );

  // Compute elapsed days in window up to today
  const startMs = new Date(`${windowStartDate}T00:00:00.000Z`).getTime();
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  const elapsedDays = Math.max(1, Math.round((todayMs - startMs) / (1000 * 3600 * 24)) + 1);
  const elapsedWeeks = Math.max(0.5, Math.min(configuredWindowWeeks, elapsedDays / 7));

  // If student has no attendance sessions at all in the window
  if (windowSessions.length === 0 || totalHistoricalHours === 0) {
    return {
      historicalHours: 0,
      sessionCount: 0,
      activeDaysCount: 0,
      activeWeeksCount: 0,
      elapsedWeeks: Math.round(elapsedWeeks * 10) / 10,
      windowWeeks: configuredWindowWeeks,
      actualWeeklyPace: 0,
      hasAttendance: false,
    };
  }

  // Defensible weekly pace: total hours in the evaluation window divided by elapsed window weeks
  const actualWeeklyPace = Math.round((totalHistoricalHours / elapsedWeeks) * 100) / 100;

  return {
    historicalHours: totalHistoricalHours,
    sessionCount: windowSessions.length,
    activeDaysCount: activeDays.size,
    activeWeeksCount: activeWeeks.size,
    elapsedWeeks: Math.round(elapsedWeeks * 10) / 10,
    windowWeeks: configuredWindowWeeks,
    actualWeeklyPace,
    hasAttendance: true,
  };
}

/**
 * Calculates confirmed future shift hours from an approved schedule between tomorrow and deadline.
 */
export function calculateConfirmedScheduleHours({
  approvedSchedule = null,
  approvedRecoveryHours = 0,
  today,
  deadline,
}) {
  const recoveryWeeks = deadline && deadline > today
    ? Math.max(1 / 7, (new Date(`${deadline}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / (7 * 86400000))
    : 1;
  const recoveryWeeklyHours = Number(approvedRecoveryHours || 0) / recoveryWeeks;
  if (!approvedSchedule || !approvedSchedule.days || !approvedSchedule.days.length) {
    return {
      confirmedWeeklyHours: Math.round(recoveryWeeklyHours * 100) / 100,
      confirmedFutureHours: Math.round(Number(approvedRecoveryHours || 0) * 100) / 100,
      hasConfirmedSchedule: Number(approvedRecoveryHours || 0) > 0,
      scheduleDaysCount: 0,
    };
  }

  const days = approvedSchedule.days;
  const weeklyHours = days.reduce((sum, d) => sum + scheduleDayHours(d), 0);
  const confirmedWeeklyHours = Math.round(weeklyHours * 100) / 100;

  let confirmedFutureHours = 0;
  if (deadline && deadline > today) {
    const daysByWeekday = new Map(days.map((d) => [d.weekday, d]));
    const cur = new Date(`${today}T00:00:00.000Z`);
    // Start tomorrow so today's shifts are not double-counted if already worked/working
    cur.setUTCDate(cur.getUTCDate() + 1);
    const end = new Date(`${deadline}T00:00:00.000Z`);

    while (cur <= end) {
      const weekday = ((cur.getUTCDay() + 6) % 7) + 1; // 1=Mon .. 7=Sun
      const dayConfig = daysByWeekday.get(weekday);
      if (dayConfig) {
        confirmedFutureHours += scheduleDayHours(dayConfig);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return {
    confirmedWeeklyHours: Math.round((confirmedWeeklyHours + recoveryWeeklyHours) * 100) / 100,
    confirmedFutureHours: Math.round((confirmedFutureHours + Number(approvedRecoveryHours || 0)) * 100) / 100,
    hasConfirmedSchedule: true,
    scheduleDaysCount: days.length,
    effectiveStartsOn: approvedSchedule.effectiveStartsOn,
    effectiveEndsOn: approvedSchedule.effectiveEndsOn,
  };
}

/**
 * Core forecast evaluation. Pure function that produces the definitive forecast status and projections.
 *
 * Statuses:
 *  - 'completed': Required duty hours have been met (remainingHours === 0).
 *  - 'on_track': Projected completion is on or before the configured deadline.
 *  - 'at_risk': Projected completion is after deadline or required pace exceeds realistic schedule capacity.
 *  - 'insufficient_data': Cannot reliably calculate (no requirement, no deadline, or no attendance history).
 */
export function calculateDutyForecast({
  requiredHours = null,
  validatedCompletedHours = 0,
  recordedHours = 0,
  deadline = null,
  today,
  historicalPace,
  confirmedSchedule,
}) {
  const reqHours = requiredHours != null ? Number(requiredHours) : null;
  const completed = Math.round(Number(validatedCompletedHours || 0) * 100) / 100;
  const remainingHours = reqHours == null ? null : Math.max(0, Math.round((reqHours - completed) * 100) / 100);

  // 1. Requirement met
  if (reqHours != null && remainingHours === 0) {
    return {
      status: 'completed',
      statusLabel: 'Completed',
      statusTone: 'approved',
      reason: 'All required duty hours have been met.',
      requiredHours: reqHours,
      completedHours: completed,
      recordedHours,
      remainingHours: 0,
      actualWeeklyPace: historicalPace.actualWeeklyPace,
      requiredWeeklyPace: 0,
      estimatedWeeksRemaining: 0,
      projectedCompletionDate: null,
      deadline,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: true,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  // 2. Insufficient data: missing requirement or deadline
  if (reqHours == null) {
    return {
      status: 'insufficient_data',
      statusLabel: 'Insufficient Data',
      statusTone: 'neutral',
      reason: 'No duty-hour requirement assigned for this academic term.',
      requiredHours: null,
      completedHours: completed,
      recordedHours,
      remainingHours: null,
      actualWeeklyPace: historicalPace.actualWeeklyPace,
      requiredWeeklyPace: null,
      estimatedWeeksRemaining: null,
      projectedCompletionDate: null,
      deadline,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: false,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  if (!deadline) {
    return {
      status: 'insufficient_data',
      statusLabel: 'Insufficient Data',
      statusTone: 'neutral',
      reason: 'No completion deadline configured for this academic term.',
      requiredHours: reqHours,
      completedHours: completed,
      recordedHours,
      remainingHours,
      actualWeeklyPace: historicalPace.actualWeeklyPace,
      requiredWeeklyPace: null,
      estimatedWeeksRemaining: null,
      projectedCompletionDate: null,
      deadline: null,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: false,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  // Calculate time remaining until deadline
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  const deadlineMs = new Date(`${deadline}T00:00:00.000Z`).getTime();
  const daysUntilDeadline = Math.round((deadlineMs - todayMs) / (1000 * 3600 * 24));
  const weeksUntilDeadline = Math.max(0, daysUntilDeadline / 7);

  // Required pace to finish by deadline
  const requiredWeeklyPace = daysUntilDeadline <= 0
    ? remainingHours
    : Math.round((remainingHours / weeksUntilDeadline) * 100) / 100;

  // Deadline already passed with remaining hours
  if (daysUntilDeadline < 0) {
    return {
      status: 'at_risk',
      statusLabel: 'At Risk',
      statusTone: 'rejected',
      reason: `The completion deadline (${deadline}) has passed with ${remainingHours} hours remaining.`,
      requiredHours: reqHours,
      completedHours: completed,
      recordedHours,
      remainingHours,
      actualWeeklyPace: historicalPace.actualWeeklyPace,
      requiredWeeklyPace,
      estimatedWeeksRemaining: null,
      projectedCompletionDate: null,
      deadline,
      daysUntilDeadline,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: false,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  // 3. Insufficient data: no valid attendance history to calculate pace
  if (!historicalPace.hasAttendance || historicalPace.actualWeeklyPace === 0) {
    return {
      status: 'insufficient_data',
      statusLabel: 'Insufficient Data',
      statusTone: 'neutral',
      reason: `No attendance recorded in the recent ${historicalPace.windowWeeks}-week evaluation period. Complete scheduled shifts to generate a projected completion date.`,
      requiredHours: reqHours,
      completedHours: completed,
      recordedHours,
      remainingHours,
      actualWeeklyPace: 0,
      requiredWeeklyPace,
      estimatedWeeksRemaining: null,
      projectedCompletionDate: null,
      deadline,
      daysUntilDeadline,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: false,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  // 4. Project completion using actual weekly pace
  const pace = historicalPace.actualWeeklyPace;
  const estimatedWeeksRemaining = Math.round((remainingHours / pace) * 10) / 10;
  const projectedMs = todayMs + Math.round(estimatedWeeksRemaining * 7 * 86400000);
  const projectedCompletionDate = new Date(projectedMs).toISOString().slice(0, 10);

  // Compare projected completion date against deadline
  const isPastDeadline = projectedCompletionDate > deadline;
  const paceShortfall = confirmedSchedule.hasConfirmedSchedule && requiredWeeklyPace > (confirmedSchedule.confirmedWeeklyHours * 1.05);

  if (isPastDeadline || paceShortfall) {
    let reason;
    if (isPastDeadline) {
      reason = `At the current pace of ${pace} h/week, completion is projected on ${projectedCompletionDate}, which is after the deadline of ${deadline}. A weekly pace of ${requiredWeeklyPace} h/week is required.`;
    } else {
      reason = `Required pace of ${requiredWeeklyPace} h/week exceeds confirmed schedule capacity of ${confirmedSchedule.confirmedWeeklyHours} h/week. Adjust your schedule or pace to finish by ${deadline}.`;
    }

    return {
      status: 'at_risk',
      statusLabel: 'At Risk',
      statusTone: 'rejected',
      reason,
      requiredHours: reqHours,
      completedHours: completed,
      recordedHours,
      remainingHours,
      actualWeeklyPace: pace,
      requiredWeeklyPace,
      estimatedWeeksRemaining,
      projectedCompletionDate,
      deadline,
      daysUntilDeadline,
      confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
      confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
      hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
      isCompleted: false,
      historicalPeriodWeeks: historicalPace.windowWeeks,
    };
  }

  // 5. On Track!
  return {
    status: 'on_track',
    statusLabel: 'On Track',
    statusTone: 'approved',
    reason: `At the current pace of ${pace} h/week, completion is projected on ${projectedCompletionDate}, on or before the deadline of ${deadline}.`,
    requiredHours: reqHours,
    completedHours: completed,
    recordedHours,
    remainingHours,
    actualWeeklyPace: pace,
    requiredWeeklyPace,
    estimatedWeeksRemaining,
    projectedCompletionDate,
    deadline,
    daysUntilDeadline,
    confirmedWeeklyHours: confirmedSchedule.confirmedWeeklyHours,
    confirmedFutureHours: confirmedSchedule.confirmedFutureHours,
    hasConfirmedSchedule: confirmedSchedule.hasConfirmedSchedule,
    isCompleted: false,
    historicalPeriodWeeks: historicalPace.windowWeeks,
  };
}

