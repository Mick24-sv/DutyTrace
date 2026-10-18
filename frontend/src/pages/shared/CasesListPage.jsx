import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import NewCaseForm from '../../components/records/NewCaseForm.jsx';
import CaseTypesCard from '../../components/records/CaseTypesCard.jsx';
import { CaseStatusBadge } from '../../components/records/StatusBadges.jsx';
import { CASE_STATUS } from '../../components/records/labels.js';
import { useApiData } from '../../hooks/useApiData.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { formatDateRange, formatDateTime } from '../../utils/format.js';

const DESCRIPTION = {
  student: 'Cases opened about your duty record. Upload the documents requested and follow the review.',
  supervisor: 'Cases for Student Assistants in your office. You can read them, add notes and record documents you received.',
  admin: 'Open, review and resolve compliance cases. A case is only opened by an administrator; nothing is opened automatically.',
};

// Compliance cases list for all three roles. Administrators also open cases and manage case types here.
export default function CasesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState('');
  const { data, loading, error } = useApiData(`/cases?${status ? `status=${status}&` : ''}_=${tick}`);
  const types = useApiData(isAdmin ? `/cases/types?_=${tick}` : null);
  const users = useApiData(isAdmin ? '/users' : null);
  const [showForm, setShowForm] = useState(false);

  const columns = [
    { key: 'ref', header: 'Reference', render: (r) => <span className="font-medium">{r.reference}</span> },
    ...(user.role !== 'student' ? [{ key: 'student', header: 'Student Assistant', render: (r) => r.student.fullName }] : []),
    { key: 'type', header: 'Type', render: (r) => r.type.name },
    { key: 'period', header: 'Period', render: (r) => formatDateRange(r.periodStart, r.periodEnd) },
    { key: 'status', header: 'Status', render: (r) => <CaseStatusBadge status={r.status} /> },
    { key: 'missing', header: 'Missing docs', render: (r) => (r.missingRequirements > 0 ? r.missingRequirements : '—') },
    { key: 'updated', header: 'Updated', render: (r) => formatDateTime(r.updatedAt, data.timezone) },
    { key: 'open', header: '', render: (r) => <Link to={r.id} className="font-medium text-teal underline">Open</Link> },
  ];

  const students = (users.data?.users ?? []).filter((u) => u.role === 'student' && u.status === 'active');
  const activeTypes = (types.data?.types ?? []).filter((t) => t.isActive);

  return (
    <>
      <PageHeader title="Compliance Cases" description={DESCRIPTION[user.role]}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="case-filter" className="mb-1 block text-xs font-medium text-muted">Status</label>
            <select id="case-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <option value="">All</option>
              {Object.entries(CASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {isAdmin && !showForm && <Button onClick={() => setShowForm(true)}>Open a case</Button>}
        </div>
      </PageHeader>

      {isAdmin && showForm && (
        <Card title="Open a compliance case" className="mb-6">
          <NewCaseForm
            students={students} types={activeTypes} onCancel={() => setShowForm(false)}
            onCreated={(c) => navigate(c.id)}
          />
        </Card>
      )}

      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {data && (
        <Card>
          <DataTable columns={columns} rows={data.cases} caption="Compliance cases" empty="No compliance cases." />
        </Card>
      )}

      {isAdmin && types.data && <div className="mt-6"><CaseTypesCard types={types.data.types} onChanged={() => setTick((t) => t + 1)} /></div>}
    </>
  );
}
