export const ACTIVE_DISCREPANCY_STATUSES = new Set(['open', 'explanation_submitted', 'under_review']);

export function findEligibleDiscrepancy(items, sessionId = null) {
  const eligible = (items ?? []).filter((item) => ACTIVE_DISCREPANCY_STATUSES.has(item.status));
  if (sessionId) {
    const matches = eligible.filter((item) => {
      const original = item.originalDetails ?? {};
      return [original.attendanceEventId, ...(original.eventIds ?? [])].some((id) => id && String(id) === String(sessionId));
    });
    if (matches.length === 1) return { item: matches[0], ambiguous: false };
    if (matches.length > 1) return { item: null, ambiguous: true };
  }
  if (eligible.length === 1) return { item: eligible[0], ambiguous: false };
  return { item: null, ambiguous: eligible.length > 1 };
}
