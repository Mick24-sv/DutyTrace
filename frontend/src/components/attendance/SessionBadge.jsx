import Badge from '../ui/Badge.jsx';

// Maps a session status from the API to a badge. "Recorded" is deliberately
// NOT the green "verified" colour: recorded time has not been verified by anyone.
const STATUS = {
  complete: { tone: 'info', label: 'Recorded' },
  in_progress: { tone: 'pending', label: 'In progress' },
  missing_time_out: { tone: 'rejected', label: 'Missing time-out' },
  orphan_time_out: { tone: 'rejected', label: 'No matching time-in' },
  needs_review: { tone: 'rejected', label: 'Needs review' },
};

export default function SessionBadge({ status }) {
  const s = STATUS[status] ?? { tone: 'info', label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
