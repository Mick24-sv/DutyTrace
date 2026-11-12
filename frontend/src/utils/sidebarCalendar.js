export function monthDays(month) {
  const [year, number] = month.split('-').map(Number);
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}

export function shiftDate(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const ROLE_AGENDAS = {
  admin: { heading: 'ADMIN AGENDA', scope: 'Important items', legend: 'Concerns, deadlines and personal events', empty: 'No important items for this day.' },
  supervisor: { heading: 'OFFICE AGENDA', scope: 'Your office', legend: 'Your office · Approved shifts', empty: 'No approved duty shifts in your office for this day.' },
  student: { heading: 'MY DUTY AGENDA', scope: 'Your duty schedule', legend: 'Your approved duty shifts', empty: 'You have no approved duty shifts for this day.' },
};

export function eventsForDay(schedules, key, role) {
  if (role === 'admin') return [];
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay() || 7;
  return schedules.flatMap(schedule => {
    if (schedule.status !== 'approved' || key < schedule.effectiveStartsOn || key > schedule.effectiveEndsOn) return [];
    return (schedule.days ?? []).filter(day => day.weekday === weekday).flatMap(day => [
      { id: `${schedule.id}-am`, title: role === 'student' ? 'Morning duty' : schedule.studentName || 'Duty shift', office: schedule.officeName, start: day.startsAt, end: day.endsAt },
      ...(day.afternoonStartsAt ? [{ id: `${schedule.id}-pm`, title: role === 'student' ? 'Afternoon duty' : schedule.studentName || 'Duty shift', office: schedule.officeName, start: day.afternoonStartsAt, end: day.afternoonEndsAt }] : []),
    ]);
  }).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function agendaItemsForDay(schedules, importantItems, key, role) {
  return role === 'admin' ? importantItems.filter(item => item.date === key) : eventsForDay(schedules, key, role);
}
