import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours } from '../../utils/format.js';

// Supervisor view: every Student Assistant assigned to MY office, with this
// month's recorded hours. The API refuses any other office.
export default function AssistantsPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState('');
  const officeId = user.office?.id;
  const { data, loading, error } = useApiData(
    officeId ? `/attendance/office/${officeId}/summary${month ? `?month=${month}` : ''}` : null,
  );

  const columns = [
    {
      key: 'fullName', header: 'Student Assistant',
      render: (a) => (<><span className="font-medium">{a.fullName}</span><span className="block text-xs text-muted">{a.email}</span></>),
    },
    {
      key: 'state', header: 'Now',
      render: (a) => <Badge tone={a.state === 'timed_in' ? 'pending' : 'neutral'}>{a.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge>,
    },
    { key: 'hours', header: 'Recorded hours', render: (a) => formatHours(a.totals.recordedHours) },
    {
      key: 'attention', header: 'Need attention',
      render: (a) => (a.totals.incompleteCount > 0 ? <Badge tone="rejected">{a.totals.incompleteCount} to review</Badge> : <span className="text-muted">None</span>),
    },
    {
      key: 'view', header: '',
      render: (a) => (<Link to={a.id} className="font-medium text-teal underline">View history</Link>),
    },
  ];

  return (
    <>
      <PageHeader title="Student Assistants" description={user.office ? `${user.office.name}: recorded attendance this month.` : undefined}>
        <div>
          <label htmlFor="month" className="mb-1 block text-xs font-medium text-muted">Month</label>
          <input
            id="month" type="month" value={month || data?.month || ''}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>
      </PageHeader>

      {!officeId && (
        <p role="alert" className="rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          You are not assigned to an office yet. Ask an administrator.
        </p>
      )}
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && (
          <DataTable columns={columns} rows={data.assistants} caption="Student assistants in your office" empty="No Student Assistants are assigned to your office." />
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Recorded hours are not verified hours. Verification happens when you approve a monthly DTR (DTR Review).
      </p>
    </>
  );
}
