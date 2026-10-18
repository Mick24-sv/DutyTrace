// Display names and badge tones for absence notices and compliance cases.
// "Reviewed" is deliberately neutral blue: it means a supervisor looked at the notice, NOT that the absence was excused.
export const ABSENCE_STATUS = {
  pending: { label: 'Awaiting review', tone: 'pending' },
  acknowledged: { label: 'Acknowledged', tone: 'info' },
  needs_follow_up: { label: 'Follow-up requested', tone: 'pending' },
  reviewed: { label: 'Reviewed', tone: 'info' },
};

export const CASE_STATUS = {
  open: { label: 'Open', tone: 'info' },
  documents_pending: { label: 'Documents pending', tone: 'pending' },
  under_review: { label: 'Under review', tone: 'info' },
  needs_correction: { label: 'Needs correction', tone: 'rejected' },
  resolved: { label: 'Resolved', tone: 'approved' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const ABSENCE_TYPE = { planned: 'Planned absence', unexpected: 'Unexpected absence' };

export const EVENT_LABEL = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  reviewed: 'Marked reviewed',
  follow_up_requested: 'Follow-up requested',
  student_responded: 'Student responded',
  document_added: 'Document uploaded',
  receipt_recorded: 'Receipt recorded by staff',
  created: 'Case opened',
  submitted_for_review: 'Submitted for review',
  review_started: 'Review started',
  correction_requested: 'Correction requested',
  resolved: 'Resolved',
  reopened: 'Reopened',
  closed: 'Closed',
  note_added: 'Note added',
  requirement_added: 'Requirement added',
  requirement_waived: 'Requirement waived',
};

export const ROLE_NAME = { student: 'Student Assistant', supervisor: 'Supervisor', admin: 'Administrator' };
