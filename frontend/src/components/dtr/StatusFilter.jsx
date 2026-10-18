import { DTR_STATUS_LABEL } from './DtrStatusBadge.jsx';

export default function StatusFilter({ value, onChange, options }) {
  return (
    <div>
      <label htmlFor="status-filter" className="mb-1 block text-xs font-medium text-muted">Status</label>
      <select
        id="status-filter" value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      >
        <option value="">All</option>
        {options.map((s) => <option key={s} value={s}>{DTR_STATUS_LABEL[s]}</option>)}
      </select>
    </div>
  );
}
