import SemesterStatusBadge from '../../components/attendance/SemesterStatusBadge.jsx';
import {Users as UIActionUsers} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HistoricalDutyHoursPanel from '../../components/attendance/HistoricalDutyHoursPanel.jsx';
import AttendanceLinks from '../../components/attendance/AttendanceLinks.jsx';
import SectionLinks from '../../components/layout/SectionLinks.jsx';
import { Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours } from '../../utils/format.js';

const PAGE_SIZE = 7;

// Supervisor view: every Student Assistant assigned to MY office, with this
// month's recorded hours. The API refuses any other office.
export default function AssistantsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const historical = searchParams.get('view') === 'historical';
  const [refresh, setRefresh] = useState(0);
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const officeId = user.office?.id;
  const monthData = useApiData(
    officeId ? `/attendance/office/${officeId}/summary?refresh=${refresh}${month ? `&month=${month}` : ''}` : null,
  );
  const semesterData = useApiData(officeId ? `/semesters/current/office?refresh=${refresh}` : null);
  const data = monthData.data;
  const loading = monthData.loading || semesterData.loading;
  const error = monthData.error || semesterData.error;
  const semesterStudents = new Map((semesterData.data?.students ?? []).map((student) => [student.id, student]));
  const filteredAssistants = (data?.assistants ?? []).filter((assistant) => {
    const semester = semesterStudents.get(assistant.id);
    return [assistant.fullName, assistant.email, assistant.state, semester?.requirementAssigned ? 'requirement assigned' : 'no requirement', assistant.totals.recordedHours]
      .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase()));
  });

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredAssistants.length / PAGE_SIZE)));
  const visibleAssistants = filteredAssistants.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns = [
    {
      key: 'fullName', header: 'Student Assistant',
      render: (a) => (<><span className="font-medium">{a.fullName}</span><span className="block text-xs text-muted">{a.email}</span></>),
    },
    {
      key: 'state', header: 'Now',
      render: (a) => <Badge tone={a.state === 'timed_in' ? 'pending' : 'neutral'}>{a.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge>,
    },
    { key: 'hours', header: 'Recorded hours (month)', render: (a) => formatHours(a.totals.recordedHours) },
    {
      key: 'semesterHours', header: 'Semester approved / remaining',
      render: (a) => {
        const semester = semesterStudents.get(a.id);
        if (!semester) return '—';
        if (!semester.requirementAssigned) return <span className="text-xs text-muted">No requirement assigned</span>;
        return `${formatHours(semester.verifiedHours)} / ${formatHours(semester.remainingHours)} h remaining`;
      },
    },
    {
      key: 'semesterStatus', header: 'Semester status', render: a => <SemesterStatusBadge status={semesterStudents.get(a.id)?.semesterStatus}/> },
    {
      key: 'attention', header: 'Need attention',
      render: (a) => (a.totals.incompleteCount > 0 ? <Badge tone="rejected">{a.totals.incompleteCount} to review</Badge> : <span className="text-muted">None</span>),
    },
    {
      key: 'view', header: '',
      render: (a) => (<Link to={a.id} className="font-medium text-teal underline">View attendance</Link>),
    },
  ];

  return (
    <>
      <AttendanceLinks />
      <details className="mb-5"><summary className="cursor-pointer py-2 text-sm text-teal">More office tools</summary><SectionLinks links={[['/supervisor/reports', 'Reports'], ['/supervisor/historical-hours', 'Previous official records'], ['/supervisor/attendance', 'My attendance'], ['/supervisor/scan', 'My time in / out']]} /></details>
      <PageHeader icon={UIActionUsers} title="Student Assistants" description={historical ? 'Record verified hours from previous paper DTRs or official records.' : user.office ? `${user.office.name}: monthly attendance and current semester requirement progress.` : undefined}>
        {!historical && <div>
          <label htmlFor="month" className="mb-1 block text-xs font-medium text-muted">Month</label>
          <input
            id="month" type="month" value={month || data?.month || ''}
            onChange={(e) => { if(e.target.value) { setMonth(e.target.value); setPage(1); } }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>}
      </PageHeader>

      <nav aria-label="Student records" className="mb-5 grid grid-cols-2 gap-2 sm:flex">
        {[[false, 'Attendance & progress'], [true, 'Historical duty hours']].map(([selected, label]) => <button key={label} type="button" aria-pressed={historical === selected}
          onClick={() => setSearchParams(selected ? {view:'historical'} : {})}
          className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${historical === selected ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-teal hover:bg-canvas'}`}>{label}</button>)}
      </nav>

      {historical ? <HistoricalDutyHoursPanel key={searchParams.get('studentId') ?? 'office'} initialStudentId={searchParams.get('studentId') ?? ''} onSaved={() => setRefresh(value => value + 1)} /> : <>

      {!officeId && (
        <p role="alert" className="rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          You are not assigned to an office yet. Ask an administrator.
        </p>
      )}
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && (
          <>
            <label htmlFor="assistant-search" className="sr-only">Search Student Assistants</label>
            <div className="relative mb-3 w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="assistant-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search assistants" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
            </div>
            <div className="hidden sm:block">
              <DataTable columns={columns} rows={visibleAssistants} caption="Student assistants in your office" empty={search ? 'No matching assistants.' : 'No Student Assistants are assigned to your office.'} />
            </div>
            <div className="divide-y divide-line sm:hidden">
              {filteredAssistants.length === 0 ? <p className="py-5 text-center text-sm text-muted">{search ? 'No matching assistants.' : 'No Student Assistants are assigned to your office.'}</p> : visibleAssistants.map((assistant) => {
                const semester = semesterStudents.get(assistant.id);
                return (
                  <article key={assistant.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-ink">{assistant.fullName}</p>
                        <p className="break-all text-xs text-muted">{assistant.email}</p>
                      </div>
                      <Badge tone={assistant.state === 'timed_in' ? 'pending' : 'neutral'}>{assistant.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge>
                    </div>
                    <div><SemesterStatusBadge status={semester?.semesterStatus}/></div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-muted">Recorded this month</dt><dd className="mt-0.5 font-mono text-ink">{formatHours(assistant.totals.recordedHours)}</dd></div>
                      <div><dt className="text-muted">Need attention</dt><dd className="mt-0.5">{assistant.totals.incompleteCount > 0 ? <Badge tone="rejected">{assistant.totals.incompleteCount} to review</Badge> : <span className="text-muted">None</span>}</dd></div>
                      <div className="col-span-2"><dt className="text-muted">Semester approved / remaining</dt><dd className="mt-0.5 font-mono text-ink">{!semester ? '—' : !semester.requirementAssigned ? 'No requirement assigned' : `${formatHours(semester.verifiedHours)} / ${formatHours(semester.remainingHours)} remaining`}</dd></div>
                    </dl>
                    <Link to={assistant.id} className="inline-flex min-h-10 items-center font-medium text-teal underline">View attendance</Link>
                  </article>
                );
              })}
            </div>
            <Pagination page={currentPage} total={filteredAssistants.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} label="Student Assistants pagination" recordLabel="Assistants" />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Monthly recorded hours are separate from semester completion. Only hours verified by approved DTRs count toward semester requirements.
        {semesterData.data?.term && ` Current term: ${semesterData.data.term.academicYear} · ${semesterData.data.term.semester}.`}
      </p>
      </>}
    </>
  );
}
