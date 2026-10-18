// Pure DTR rules: no database, no clock. Everything here is unit-tested.
import { localDateKey } from '../attendance/calc.js';

export const DTR_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  NEEDS_CORRECTION: 'needs_correction',
});

// Allowed status moves (mirrored by a database trigger as defence in depth).
// "draft -> draft" is a regeneration and is handled separately (it adds a revision).
export const TRANSITIONS = Object.freeze({
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'needs_correction'],
  needs_correction: ['draft', 'submitted'],
  approved: [],
});

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

// 'YYYY-MM' of an instant in the university timezone.
export const localMonthOf = (instant, timeZone) => localDateKey(instant, timeZone).slice(0, 7);

// A month may only be turned into a DTR once it is OVER in the local timezone,
// i.e. the current local month is strictly later. ('YYYY-MM' compares correctly as text.)
export const isMonthEnded = (month, now, timeZone) => month < localMonthOf(now, timeZone);

// The most recent `count` months that have already ended, newest first.
export function endedMonths(now, timeZone, count = 12) {
  let [y, m] = localMonthOf(now, timeZone).split('-').map(Number);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

const toHours = (secs) => Math.round((secs / 3600) * 100) / 100;
export const secondsToHours = toHours;

const FLAG_TEXT = {
  missing_time_out: 'No time-out was recorded. Not counted.',
  orphan_time_out: 'Time-out without a time-in. Not counted.',
  needs_review: 'Session is longer than the allowed maximum. Not counted until reviewed.',
  in_progress: 'Session was still open when the DTR was generated. Not counted.',
};

// Turns an attendance month summary (attendance.service.monthHistory) into the
// frozen content of one DTR revision. Incomplete sessions are listed as FLAGS and
// never counted. Verified hours are deliberately NOT part of a snapshot: they only
// exist after a supervisor approves.
export function buildSnapshot({ history, student, office, requiredHours, generatedAt }) {
  const flags = [];
  for (const day of history.days) {
    for (const s of day.sessions) {
      if (s.counted) continue;
      flags.push({ date: day.date, sessionId: s.id, status: s.status, message: FLAG_TEXT[s.status] ?? 'Needs review. Not counted.' });
    }
  }
  const recordedSeconds = history.totals.recordedSeconds;
  const recordedHours = toHours(recordedSeconds);
  return {
    version: 1,
    month: history.month,
    timezone: history.timezone,
    maxSessionHours: history.maxSessionHours,
    generatedAt: generatedAt.toISOString(),
    template: { official: false, name: 'DutyTrace provisional DTR template' },
    student: { id: student.id, fullName: student.fullName, email: student.email },
    office: { id: office.id, code: office.code, name: office.name },
    days: history.days,
    flags,
    totals: {
      recordedSeconds,
      recordedHours,
      countedSessions: history.totals.countedSessions,
      incompleteCount: flags.length,
      requiredHours: Number(requiredHours),
      remainingHours: Math.max(0, Math.round((Number(requiredHours) - recordedHours) * 100) / 100),
    },
  };
}
