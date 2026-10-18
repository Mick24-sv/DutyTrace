// Pure rules for absence notifications. NOTHING here excuses an absence or touches hours: a notice is
// a record plus a review conversation.

export const ABSENCE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  REVIEWED: 'reviewed',
  NEEDS_FOLLOW_UP: 'needs_follow_up',
});

// Allowed moves (mirrored by a database trigger). `needs_follow_up -> pending` is the student answering.
export const ABSENCE_TRANSITIONS = Object.freeze({
  pending: ['acknowledged', 'reviewed', 'needs_follow_up'],
  acknowledged: ['reviewed', 'needs_follow_up'],
  needs_follow_up: ['pending', 'reviewed'],
  reviewed: [],
});
export const canMoveAbsence = (from, to) => (ABSENCE_TRANSITIONS[from] ?? []).includes(to);

// Documents may be attached until the notice has been reviewed.
export const ABSENCE_ACCEPTS_DOCUMENTS = new Set(['pending', 'acknowledged', 'needs_follow_up']);

const dayNumber = (key) => Math.round(new Date(`${key}T00:00:00Z`).getTime() / 86400000);
export const MAX_SPAN_DAYS = 31; // technical sanity limit, NOT an ADNU policy
const MAX_DISTANCE_DAYS = 366;   // how far from today a date may be, also a sanity limit

/**
 * @param type   'planned' | 'unexpected'
 * @param start/end/today  'YYYY-MM-DD' (today = the current date in the university timezone)
 * @returns {} when fine, otherwise { field: message }
 * "Planned" and "unexpected" are definitions, not policy: a planned absence is reported before it
 * starts, an unexpected one has already started (or is today).
 */
export function validateAbsenceDates({ type, start, end, today }) {
  const errors = {};
  if (dayNumber(end) < dayNumber(start)) errors.endDate = 'The last day cannot be before the first day.';
  else if (dayNumber(end) - dayNumber(start) + 1 > MAX_SPAN_DAYS) errors.endDate = `An absence notice can cover at most ${MAX_SPAN_DAYS} days.`;
  if (Math.abs(dayNumber(start) - dayNumber(today)) > MAX_DISTANCE_DAYS) errors.startDate = 'That date is too far from today.';
  if (!errors.startDate) {
    if (type === 'planned' && dayNumber(start) < dayNumber(today)) {
      errors.startDate = 'A planned absence must start today or later. For an absence that already started, choose "Unexpected".';
    }
    if (type === 'unexpected' && dayNumber(start) > dayNumber(today)) {
      errors.startDate = 'An unexpected absence cannot start in the future. For one you know about in advance, choose "Planned".';
    }
  }
  return errors;
}
