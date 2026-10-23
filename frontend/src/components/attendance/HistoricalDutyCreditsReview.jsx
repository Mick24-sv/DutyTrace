import { useState } from 'react';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatHours, formatMonth } from '../../utils/format.js';

export default function HistoricalDutyCreditsReview() {
  const [refresh, setRefresh] = useState(0);
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const { data, loading, error } = useApiData(`/historical-duty-hours/oversight?refresh=${refresh}`);

  async function decide(id, action) {
    const reason = notes[id]?.trim() ?? '';
    if (reason.length < 5) { setActionError('Enter an administrator review note of at least 5 characters.'); return; }
    setBusyId(id); setActionError('');
    try {
      await apiPost(`/historical-duty-hours/${id}/${action}`, { reason });
      setNotes((current) => { const next = { ...current }; delete next[id]; return next; });
      setRefresh((value) => value + 1);
    } catch (err) { setActionError(err.message); }
    finally { setBusyId(''); }
  }

  return (
    <Card title="Historical duty credit oversight" className="mt-6">
      <p className="mb-3 text-sm text-muted">Exceptional entries, amendments, and credits for finalized terms require administrator review before they affect verified semester totals.</p>
      {loading && <p role="status" className="text-sm text-muted">Loading pending historical entries…</p>}
      {error && <p role="alert" className="text-sm text-bad-fg">Unable to load historical credit queue: {error}</p>}
      {actionError && <p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{actionError}</p>}
      {!loading && !error && !(data?.pending?.length) && <p className="text-sm text-muted">No historical duty credits are waiting for review.</p>}
      <ul className="space-y-3">{(data?.pending ?? []).map((item) => <li key={item.id} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-ink">{item.studentName} · {formatMonth(item.month)} · {formatHours(item.hours)}</h3><p className="text-xs text-muted">{item.officeName} · {item.academicYear} {item.semester} semester{item.workDate ? ` · ${item.workDate}` : ' · monthly total'}</p></div><Badge tone="pending">{item.amendsId ? 'Amendment' : 'Exceptional'} · pending review</Badge></div>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><div><dt className="text-muted">Source</dt><dd className="text-ink">{item.verificationSource}</dd></div><div><dt className="text-muted">Document/reference</dt><dd className="break-words text-ink">{item.verificationReference}</dd></div><div><dt className="text-muted">Supervisor reason</dt><dd className="break-words text-ink">{item.reason}</dd></div></dl>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 text-xs font-medium text-muted">Administrator review note<textarea minLength={5} maxLength={1000} rows={2} required value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Required for approval or rejection"/></label><div className="flex gap-2"><Button disabled={busyId === item.id} onClick={() => decide(item.id, 'approve')}>{busyId === item.id ? 'Saving…' : 'Approve'}</Button><Button variant="secondary" disabled={busyId === item.id} onClick={() => decide(item.id, 'reject')}>Reject</Button></div></div>
      </li>)}</ul>
    </Card>
  );
}
