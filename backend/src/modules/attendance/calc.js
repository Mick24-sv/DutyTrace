// Pure functions (no database, no clock) that turn raw attendance events into
// sessions and totals. Keeping them pure makes every rule easy to test.
//
// SOURCE OF TRUTH: attendance_events. Hours are always derived from events,
// never stored.
//
// RULES (assumptions to confirm with ADNU; see docs/open-questions.md):
//  1. A time_in followed by the next time_out is one COMPLETE session.
//  2. Only complete sessions that are not over the length limit count as
//     recorded hours. Everything else is shown, flagged, and NOT counted:
//       in_progress      open time_in, still within the length limit
//       missing_time_out open time_in that is too old, or was followed by another time_in
//       orphan_time_out  a time_out with no time_in before it
//       needs_review     complete, but longer than the limit (likely a forgotten time-out)
//  3. A session belongs to the local calendar day of its time_in (an orphan
//     time_out belongs to the day of the time_out).
//  4. "Recorded" hours are NOT "verified" hours. Verification is a separate
//     supervisor step that arrives with the DTR workflow (Phase 4).

export const STATUS = Object.freeze({
  COMPLETE: 'complete',
  IN_PROGRESS: 'in_progress',
  MISSING_TIME_OUT: 'missing_time_out',
  ORPHAN_TIME_OUT: 'orphan_time_out',
  NEEDS_REVIEW: 'needs_review',
});

const INCOMPLETE = new Set([STATUS.MISSING_TIME_OUT, STATUS.ORPHAN_TIME_OUT, STATUS.NEEDS_REVIEW]);

const formatters = new Map();
// 'YYYY-MM-DD' of an instant in the given IANA timezone.
export function localDateKey(date, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    );
  }
  return formatters.get(timeZone).format(date);
}

const seconds = (from, to) => Math.round((to.getTime() - from.getTime()) / 1000);

/**
 * @param events  [{ id, eventType: 'time_in'|'time_out', recordedAt: Date }] sorted oldest first
 * @param options { now: Date, timeZone: string, maxSessionSeconds: number }
 * @returns sessions, oldest first
 */
export function buildSessions(events, { now, timeZone, maxSessionSeconds }) {
  const sessions = [];
  let open = null;

  const incomplete = (timeIn, status) => ({
    id: timeIn.id,
    status,
    timeIn: timeIn.recordedAt.toISOString(),
    timeOut: null,
    seconds: null,
    counted: false,
    date: localDateKey(timeIn.recordedAt, timeZone),
    flags: [],
  });

  for (const e of events) {
    if (e.eventType === 'time_in') {
      // Two time_ins in a row: the earlier one never got a time_out.
      if (open) sessions.push(incomplete(open, STATUS.MISSING_TIME_OUT));
      open = e;
    } else if (open) {
      const secs = seconds(open.recordedAt, e.recordedAt);
      const date = localDateKey(open.recordedAt, timeZone);
      const tooLong = secs > maxSessionSeconds;
      sessions.push({
        id: open.id,
        status: tooLong ? STATUS.NEEDS_REVIEW : STATUS.COMPLETE,
        timeIn: open.recordedAt.toISOString(),
        timeOut: e.recordedAt.toISOString(),
        seconds: secs,
        counted: !tooLong,
        date,
        flags: localDateKey(e.recordedAt, timeZone) !== date ? ['crosses_midnight'] : [],
      });
      open = null;
    } else {
      sessions.push({
        id: e.id,
        status: STATUS.ORPHAN_TIME_OUT,
        timeIn: null,
        timeOut: e.recordedAt.toISOString(),
        seconds: null,
        counted: false,
        date: localDateKey(e.recordedAt, timeZone),
        flags: [],
      });
    }
  }

  if (open) {
    const stillOpen = seconds(open.recordedAt, now) <= maxSessionSeconds;
    sessions.push(incomplete(open, stillOpen ? STATUS.IN_PROGRESS : STATUS.MISSING_TIME_OUT));
  }
  return sessions;
}

const toHours = (secs) => Math.round((secs / 3600) * 100) / 100;

// Group sessions by local day and compute totals for one month ('YYYY-MM').
// Hours are summed from whole SECONDS and rounded once at the end, so rounding
// error never accumulates.
export function summarizeMonth(sessions, month) {
  const inMonth = sessions.filter((s) => s.date.startsWith(`${month}-`));

  const byDay = new Map();
  for (const s of inMonth) {
    if (!byDay.has(s.date)) byDay.set(s.date, []);
    byDay.get(s.date).push(s);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const recordedSeconds = list.reduce((sum, s) => sum + (s.counted ? s.seconds : 0), 0);
      return { date, sessions: list, recordedSeconds, recordedHours: toHours(recordedSeconds) };
    });

  const recordedSeconds = days.reduce((sum, d) => sum + d.recordedSeconds, 0);
  return {
    days,
    totals: {
      recordedSeconds,
      recordedHours: toHours(recordedSeconds),
      countedSessions: inMonth.filter((s) => s.counted).length,
      incompleteCount: inMonth.filter((s) => INCOMPLETE.has(s.status)).length,
      inProgress: inMonth.some((s) => s.status === STATUS.IN_PROGRESS),
      // Verification is a separate, later step (Phase 4). Never derived from recorded time.
      verifiedHours: 0,
      verificationAvailable: false,
    },
  };
}
