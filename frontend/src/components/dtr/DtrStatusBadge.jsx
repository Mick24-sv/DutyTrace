import Badge from '../ui/Badge.jsx';

export const DTR_STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  needs_correction: 'Needs correction',
};

const TONE = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'pending',
  approved: 'approved',
  needs_correction: 'rejected',
};

export default function DtrStatusBadge({ status }) {
  return <Badge tone={TONE[status] ?? 'neutral'}>{DTR_STATUS_LABEL[status] ?? status}</Badge>;
}
