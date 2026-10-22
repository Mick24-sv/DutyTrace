import { localDateKey } from '../attendance/calc.js';

export const isDateKey = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function calculateSemesterProgress({ requiredHours, verifiedHours }) {
  if (requiredHours == null) {
    return {
      requiredHours: null,
      verifiedHours,
      remainingHours: null,
      completionPercentage: null,
      requirementAssigned: false,
    };
  }
  const remainingHours = Math.max(0, Math.round((requiredHours - verifiedHours) * 100) / 100);
  const completionPercentage = requiredHours > 0
    ? Math.min(100, Math.round((verifiedHours / requiredHours) * 10000) / 100)
    : null;
  return { requiredHours, verifiedHours, remainingHours, completionPercentage, requirementAssigned: true };
}

export function verifiedSecondsForTerm(dtrRows, fromDate, toDate, timeZone) {
  return dtrRows.reduce((total, dtr) => {
    if (dtr.status !== 'approved') return total;
    const sessions = (dtr.snapshot?.days ?? []).flatMap((day) => day.sessions ?? []);
    return total + sessions.reduce((seconds, session) => {
      if (!session.counted || !session.timeIn || !Number.isFinite(session.seconds)) return seconds;
      const date = localDateKey(new Date(session.timeIn), timeZone);
      return date >= fromDate && date <= toDate ? seconds + session.seconds : seconds;
    }, 0);
  }, 0);
}

export function currentTermForDate(terms, now, timeZone) {
  const today = localDateKey(now, timeZone);
  return terms.find((term) => term.startsOn <= today && today <= term.endsOn) ?? null;
}
