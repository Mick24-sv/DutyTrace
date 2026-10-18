import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import DtrListTable from '../../components/dtr/DtrListTable.jsx';
import StatusFilter from '../../components/dtr/StatusFilter.jsx';
import { useApiData } from '../../hooks/useApiData.js';

// Administrator: read-only overview of every DTR. Administrators cannot approve or return DTRs.
export default function DtrOverviewPage() {
  const [status, setStatus] = useState('');
  const { data, loading, error } = useApiData(`/dtrs${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHeader title="DTR Overview" description="All monthly DTRs across offices. Read-only: approval belongs to office supervisors.">
        <StatusFilter value={status} onChange={setStatus} options={['draft', 'submitted', 'under_review', 'approved', 'needs_correction']} />
      </PageHeader>
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && <DtrListTable dtrs={data.dtrs} linkLabel="View" showOffice />}
      </Card>
    </>
  );
}
