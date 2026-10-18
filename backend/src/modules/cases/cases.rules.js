// Pure rules for compliance cases. A case is opened by a PERSON (an administrator); nothing here
// derives a case, or a compliant/noncompliant verdict, from hours or absence notices.

export const CASE_STATUS = Object.freeze({
  OPEN: 'open',
  DOCUMENTS_PENDING: 'documents_pending',
  UNDER_REVIEW: 'under_review',
  NEEDS_CORRECTION: 'needs_correction',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
});

// Allowed moves (mirrored by a database trigger as defence in depth).
export const CASE_TRANSITIONS = Object.freeze({
  open: ['documents_pending', 'under_review', 'closed'],
  documents_pending: ['under_review', 'closed'],
  under_review: ['documents_pending', 'needs_correction', 'resolved', 'closed'],
  needs_correction: ['under_review', 'closed'],
  resolved: ['under_review', 'closed'], // under_review = reopened by an administrator, with a reason
  closed: [],
});
export const canMoveCase = (from, to) => (CASE_TRANSITIONS[from] ?? []).includes(to);

// While a case is in these states the student may upload documents / respond.
export const STUDENT_CAN_UPLOAD = new Set(['open', 'documents_pending', 'needs_correction']);
// Requirements may be added or waived until the case is decided.
export const REQUIREMENTS_EDITABLE = new Set(['open', 'documents_pending', 'under_review', 'needs_correction']);

export const caseReference = (year, seq) => `CC-${year}-${String(seq).padStart(6, '0')}`;

// requirements: [{ label, isRequired, waived, docCount }] -> labels still missing.
// A requirement is satisfied by being waived OR by having at least one submitted document / recorded receipt.
export const missingRequirements = (requirements) =>
  requirements.filter((r) => r.isRequired && !r.waived && r.docCount === 0).map((r) => r.label);

const dayNumber = (key) => Math.round(new Date(`${key}T00:00:00Z`).getTime() / 86400000);
export const validateCasePeriod = (start, end) =>
  dayNumber(end) < dayNumber(start) ? { periodEnd: 'The end of the period cannot be before its start.' } : {};
