import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const { data, loading, error } = useApiData(`/absences${status ? `?status=${status}` : ''}`);

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
          <DataTable columns={columns} rows={data.absences} caption="Absence notices" empty="No absence notices." />
        </Card>
      )}
    </>
  );
}
