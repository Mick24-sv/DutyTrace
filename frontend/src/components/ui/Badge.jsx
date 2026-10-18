// Status colors are reserved for status indicators (design rule 2).
const TONES = {
  approved: 'bg-ok-bg text-ok-fg',
  pending: 'bg-warn-bg text-warn-fg',
  rejected: 'bg-bad-bg text-bad-fg',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-canvas text-muted', // not a status; for plain labels
};

export default function Badge({ tone = 'info', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
