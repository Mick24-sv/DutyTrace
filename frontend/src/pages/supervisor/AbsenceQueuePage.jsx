import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { AbsenceStatusBadge } from '../../components/records/StatusBadges.jsx';
import { ABSENCE_STATUS, ABSENCE_TYPE } from '../../components/records/labels.js';
import { useApiData } from '../../hooks/useApiData.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { formatDateRange, formatDateTime } from '../../utils/format.js';

// Supervisor: absence notices from Student Assistants of my office.
export default function AbsenceQueuePage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { data, loading, error } = useApiData(`/absences${status ? `?status=${status}` : ''}`);
  const absences = (data?.absences ?? []).filter((absence) => [absence.student?.fullName, ABSENCE_TYPE[absence.type], absence.status, absence.startDate, absence.endDate]
    .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase())));

  const columns = [
    { key: 'student', header: 'Student Assistant', render: (r) => <span className="font-medium">{r.student.fullName}</span> },
    { key: 'dates', header: 'Date(s)', render: (r) => formatDateRange(r.startDate, r.endDate) },
    { key: 'type', header: 'Type', render: (r) => ABSENCE_TYPE[r.type] },
    { key: 'status', header: 'Status', render: (r) => <AbsenceStatusBadge status={r.status} /> },
    { key: 'sent', header: 'Submitted', render: (r) => formatDateTime(r.submittedAt, data.timezone) },
    { key: 'open', header: '', render: (r) => <Link to={r.id} className="font-medium text-teal underline">Open</Link> },
  ];

  return (
    <>
      <PageHeader
        title="Absence Notices"
        description={user.office ? `Notices from Student Assistants in ${user.office.name}. A notice is information for you; it does not excuse an absence.` : 'You are not assigned to an office yet.'}
      >
        <div>
          <label htmlFor="abs-filter" className="mb-1 block text-xs font-medium text-muted">Status</label>
          <select id="abs-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">All</option>
            {Object.entries(ABSENCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </PageHeader>
      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {data && (
        <Card>
          <label htmlFor="absence-search" className="sr-only">Search absence notices</label>
          <div className="relative mb-3 w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="absence-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notices" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
          </div>
          <div className="hidden sm:block">
            <DataTable columns={columns} rows={absences} caption="Absence notices" empty={search ? 'No matching notices.' : 'No absence notices.'} />
          </div>
          <div className="divide-y divide-line sm:hidden">
            {absences.length === 0 ? <p className="py-5 text-center text-sm text-muted">{search ? 'No matching notices.' : 'No absence notices.'}</p> : absences.map((absence) => (
              <article key={absence.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-ink">{absence.student.fullName}</p>
                    <p className="text-xs text-muted">{formatDateRange(absence.startDate, absence.endDate)}</p>
                  </div>
                  <AbsenceStatusBadge status={absence.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-ink">{ABSENCE_TYPE[absence.type]}</span>
                  <span className="text-muted">Submitted {formatDateTime(absence.submittedAt, data.timezone)}</span>
                  <Link to={absence.id} className="font-medium text-teal underline">Open</Link>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
