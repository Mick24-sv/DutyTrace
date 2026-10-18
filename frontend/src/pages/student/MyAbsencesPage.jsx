import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { AbsenceStatusBadge } from '../../components/records/StatusBadges.jsx';
import { ABSENCE_TYPE } from '../../components/records/labels.js';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatDateRange, formatDateTime, todayKey } from '../../utils/format.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';

// Student Assistant: submit an absence notice and follow its review status.
export default function MyAbsencesPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useApiData('/absences');
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('planned');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      const notice = await apiPost('/absences', { absenceType: type, startDate, endDate: endDate || undefined, reason });
      navigate(notice.id);
    } catch (err) {
      setFormError(err.details ? Object.values(err.details).join(' ') : err.message);
    } finally { setBusy(false); }
  }

  const columns = [
    { key: 'dates', header: 'Date(s)', render: (r) => <span className="font-medium">{formatDateRange(r.startDate, r.endDate)}</span> },
    { key: 'type', header: 'Type', render: (r) => ABSENCE_TYPE[r.type] },
    { key: 'status', header: 'Review status', render: (r) => <AbsenceStatusBadge status={r.status} /> },
    { key: 'sent', header: 'Submitted', render: (r) => formatDateTime(r.submittedAt, data.timezone) },
    { key: 'open', header: '', render: (r) => <Link to={r.id} className="font-medium text-teal underline">Open</Link> },
  ];

  const today = data ? todayKey(data.timezone) : undefined;
  return (
    <>
      <PageHeader title="Absence Notices" description="Tell your supervisor about an absence and follow how it is being reviewed.">
        {!showForm && <Button onClick={() => setShowForm(true)}>New absence notice</Button>}
      </PageHeader>

      <p className="mb-6 flex gap-2 rounded-card bg-info-bg px-4 py-3 text-sm text-info-fg">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Submitting a notice tells your supervisor about the absence. It does <strong>not</strong> excuse the absence or
          reduce the duty hours you are required to render. Any decision on that is made by the people responsible for it, not by this form.
        </span>
      </p>

      {showForm && (
        <Card title="New absence notice" className="mb-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="abs-type" className="mb-1 block text-xs font-medium text-muted">Type</label>
              <select id="abs-type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
                <option value="planned">Planned: I am telling you ahead of time</option>
                <option value="unexpected">Unexpected: it already happened or is happening now</option>
              </select>
            </div>
            <div>
              <label htmlFor="abs-start" className="mb-1 block text-xs font-medium text-muted">First day of absence</label>
              <input id="abs-start" type="date" value={startDate} required onChange={(e) => setStartDate(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="abs-end" className="mb-1 block text-xs font-medium text-muted">Last day (leave blank for one day)</label>
              <input id="abs-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="abs-reason" className="mb-1 block text-xs font-medium text-muted">Reason</label>
              <textarea id="abs-reason" rows={4} value={reason} required maxLength={2000} onChange={(e) => setReason(e.target.value)} className={field} />
              <p className="mt-1 text-xs text-muted">Only your supervisors for this office can read this. You can attach a supporting document after you submit.{today && ` Today is ${today}.`}</p>
            </div>
            {formError && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit notice'}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {data && (
        <Card title="Your notices">
          <DataTable columns={columns} rows={data.absences} caption="Your absence notices" empty="You have not submitted any absence notices." />
        </Card>
      )}
    </>
  );
}
