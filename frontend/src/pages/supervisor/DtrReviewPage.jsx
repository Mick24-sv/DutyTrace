import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import DtrListTable from '../../components/dtr/DtrListTable.jsx';
import StatusFilter from '../../components/dtr/StatusFilter.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';

// Supervisor: DTRs of Student Assistants in MY office that have been submitted. The API refuses other offices.
export default function DtrReviewPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('submitted');
  const { data, loading, error } = useApiData(user.office ? `/dtrs${status ? `?status=${status}` : ''}` : null);

  return (
    <>
      <PageHeader title="DTR Review" description={user.office ? `${user.office.name}: submitted monthly DTRs.` : undefined}>
        <StatusFilter value={status} onChange={setStatus} options={['submitted', 'under_review', 'approved', 'needs_correction']} />
      </PageHeader>
      {!user.office && (
        <p role="alert" className="rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">You are not assigned to an office yet. Ask an administrator.</p>
      )}
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && <DtrListTable dtrs={data.dtrs} linkLabel="Review" />}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Recorded hours are not verified hours. Only approving a DTR verifies its counted hours. Drafts are private to the student until submitted.
      </p>
    </>
  );
}
