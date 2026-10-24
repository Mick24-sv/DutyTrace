export function discrepancyTimezone(record) {
  return record.timezone ?? record.originalDetails?.timezone ?? 'UTC';
}

export function formatDiscrepancyTime(value, timezone) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date(value));
}

export function clockOutBounds(record, clockIn = '') {
  const shiftDate = record.date?.slice(0, 10);
  const scheduledEnd = record.originalDetails?.scheduledEnd;
  let endDate;
  if (scheduledEnd) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: discrepancyTimezone(record), year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(scheduledEnd));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    endDate = `${values.year}-${values.month}-${values.day}`;
  }
  return {
    min: clockIn || (shiftDate ? `${shiftDate}T00:00` : undefined),
    max: endDate ? `${endDate}T23:59` : undefined,
  };
}
