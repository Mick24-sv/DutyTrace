import { scheduledCapacity } from '../semesters/semester-status.js';

export function catchUpCapacity({ days, startsOn, endsOn, today, recordedHoursToday = 0 }) {
  return scheduledCapacity({ today, deadline: endsOn, schedule: { startsOn, endsOn,
    days: days.map(day => ({ weekday: day.weekday, starts_at: day.startsAt, ends_at: day.endsAt,
      afternoon_starts_at: day.afternoonStartsAt, afternoon_ends_at: day.afternoonEndsAt })),
  }, sessions: [{ counted: true, date: today, seconds: recordedHoursToday * 3600 }] }) ?? 0;
}

const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const duration = day => (minutes(day.endsAt) - minutes(day.startsAt)
  + (day.afternoonStartsAt ? minutes(day.afternoonEndsAt) - minutes(day.afternoonStartsAt) : 0)) / 60;

// These are recurring availability proposals, never confirmed assignments.
export function catchUpCandidates({ days, requirement }) {
  const candidates = [];
  for (const day of days) {
    for (const [from, to] of [['startsAt', 'endsAt'], ['afternoonStartsAt', 'afternoonEndsAt']]) {
      if (!day[from] || !day[to]) continue;
      const window = requirement.permittedTimeWindows.find(window => minutes(window.startTime) <= minutes(day[from]) && minutes(window.endTime) >= minutes(day[to]));
      if (!window) continue;
      for (const direction of ['earlier', 'later']) {
        const available = direction === 'earlier' ? minutes(day[from]) - minutes(window.startTime) : minutes(window.endTime) - minutes(day[to]);
        for (let extra = 30; extra <= available; extra += 30) {
          if (requirement.maximumDailyHours != null && duration(day) + extra / 60 > requirement.maximumDailyHours) break;
          const updated = { ...day, [direction === 'earlier' ? from : to]: time(direction === 'earlier' ? minutes(day[from]) - extra : minutes(day[to]) + extra) };
          if (updated.afternoonStartsAt && updated.endsAt > updated.afternoonStartsAt) continue;
          candidates.push({ kind: 'extend', weekday: day.weekday, extraHoursPerWeek: extra / 60,
            days: days.map(current => current.weekday === day.weekday ? updated : current) });
        }
      }
    }
  }
  for (const weekday of requirement.permittedWeekdays.filter(day => day <= 6 && !days.some(current => current.weekday === day))) {
    for (const window of requirement.permittedTimeWindows) {
      const maximum = Math.min((minutes(window.endTime) - minutes(window.startTime)) / 60, requirement.maximumDailyHours ?? 24);
      for (let hours = Math.ceil(requirement.minimumDailyHours * 2) / 2; hours <= maximum; hours += .5) {
        candidates.push({ kind: 'add', weekday, extraHoursPerWeek: hours,
          days: [...days, { weekday, startsAt: window.startTime.slice(0, 5), endsAt: time(minutes(window.startTime) + hours * 60), afternoonStartsAt: null, afternoonEndsAt: null }].sort((a,b)=>a.weekday-b.weekday) });
      }
    }
  }
  return candidates;
}
