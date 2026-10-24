import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import DtrListTable from '../../components/dtr/DtrListTable.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import StatusFilter from '../../components/dtr/StatusFilter.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours, formatMonth } from '../../utils/format.js';

const PAGE_SIZE = 7;

// Supervisor: DTRs of Student Assistants in MY office that have been submitted. The API refuses other offices.
export default function DtrReviewPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('submitted');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApiData(user.office ? `/dtrs${status ? `?status=${status}` : ''}` : null);
  const dtrs = (data?.dtrs ?? []).filter((dtr) => [dtr.student?.fullName, dtr.student?.email, dtr.month, dtr.status]
    .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(dtrs.length / PAGE_SIZE)));
  const visibleDtrs = dtrs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <PageHeader title="DTR Review" description={user.office ? `${user.office.name}: submitted monthly DTRs.` : undefined}>
        <StatusFilter value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={['submitted', 'under_review', 'approved', 'needs_correction']} />
      </PageHeader>
      {!user.office && (
        <p role="alert" className="rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">You are not assigned to an office yet. Ask an administrator.</p>
      )}
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && (
          <>
            <label htmlFor="dtr-review-search" className="sr-only">Search DTRs</label>
            <div className="relative mb-3 w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="dtr-review-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search DTRs" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
            </div>
            <div className="hidden sm:block"><DtrListTable dtrs={visibleDtrs} linkLabel="Review" /></div>
            <div className="divide-y divide-line sm:hidden">
              {dtrs.length === 0 ? <p className="py-5 text-center text-sm text-muted">No DTRs match this filter.</p> : visibleDtrs.map((dtr) => (
                <article key={dtr.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-ink">{dtr.student.fullName}</p>
                      <p className="break-all text-xs text-muted">{dtr.student.email}</p>
                    </div>
                    <span className="shrink-0 text-sm text-ink">{formatMonth(dtr.month)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <DtrStatusBadge status={dtr.status} />
                    <span className="text-muted">Recorded {formatHours(dtr.recordedHours)} · Verified {dtr.verifiedHours != null ? formatHours(dtr.verifiedHours) : 'Not verified'}</span>
                    <Link to={dtr.id} className="font-medium text-teal underline">Review</Link>
                  </div>
                </article>
              ))}
            </div>
            <Pagination page={currentPage} total={dtrs.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} label="DTR pagination" recordLabel="DTRs" />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Recorded hours are not verified hours. Only approving a DTR verifies its counted hours. Drafts are private to the student until submitted.
      </p>
    </>
  );
}
