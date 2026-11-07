import SemesterStatusBadge from '../../components/attendance/SemesterStatusBadge.jsx';
import {Users as UIActionUsers} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HistoricalDutyHoursPanel from '../../components/attendance/HistoricalDutyHoursPanel.jsx';
import AttendanceLinks from '../../components/attendance/AttendanceLinks.jsx';
import SectionLinks from '../../components/layout/SectionLinks.jsx';
import { Search, GraduationCap, Clock, ArrowUpRight, ShieldCheck, Hourglass } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import UserAvatar from '../../components/ui/UserAvatar.jsx';
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
    return [assistant.fullName, assistant.email, assistant.course, assistant.yearLevel ? 'Year '+assistant.yearLevel : '', assistant.state, semester?.requirementAssigned ? 'requirement assigned' : 'no requirement', assistant.totals.recordedHours]
      .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase()));
  });

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredAssistants.length / PAGE_SIZE)));
  const visibleAssistants = filteredAssistants.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);


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
            <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {filteredAssistants.length === 0 ? <p className="py-5 text-center text-sm text-muted lg:col-span-2 xl:col-span-3">{search ? 'No matching assistants.' : 'No Student Assistants are assigned to your office.'}</p> : visibleAssistants.map((assistant) => {
                const semester=semesterStudents.get(assistant.id);
                const pending=semesterData.loading;
                const unavailable=Boolean(semesterData.error);
                return <article key={assistant.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex min-w-0 items-start gap-3">
                    <UserAvatar user={assistant} className="h-14 w-14 text-lg"/>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold text-navy">{assistant.fullName}</h3>
                      <p className="mt-1 break-all text-xs text-muted">{assistant.email}</p>
                      <div className="mt-2"><Badge tone={assistant.state === 'timed_in' ? 'pending' : 'neutral'}>{assistant.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge></div>
                    </div>
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-xs text-muted"><GraduationCap aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/><span className="min-w-0 break-words">{[assistant.yearLevel?'Year '+assistant.yearLevel:null,assistant.course].filter(Boolean).join(' / ')||'Academic details not provided'}</span></p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <div className="min-w-0"><dt className="flex items-center gap-1 text-xs text-muted"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-teal"/>Verified semester</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums text-navy">{pending?'Loading':unavailable?'Unavailable':semester?formatHours(semester.verifiedHours):'No term'}</dd></div>
                    <div className="min-w-0"><dt className="flex items-center gap-1 text-xs text-muted"><Hourglass aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-teal"/>Remaining</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums text-navy">{pending?'Loading':unavailable?'Unavailable':semester?.requirementAssigned?formatHours(semester.remainingHours):'Not assigned'}</dd></div>
                  </dl>
                  {semester&&!unavailable&&<div className="mt-3 flex flex-wrap items-center justify-between gap-2"><SemesterStatusBadge status={semester.semesterStatus}/>{semester.requirementAssigned&&<span className="text-xs text-muted">{formatHours(semester.requiredHours)} required</span>}</div>}
                  {!semester&&!pending&&!unavailable&&<p className="mt-2 text-xs text-muted">No current semester requirement.</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted"><span>Recorded this month: <span className="font-medium text-ink">{formatHours(assistant.totals.recordedHours)}</span></span>{assistant.totals.incompleteCount>0&&<Badge tone="rejected">{assistant.totals.incompleteCount} to review</Badge>}</div>
                  <div className="mt-auto pt-4"><Link to={assistant.id} className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg bg-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal/90 focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"><Clock aria-hidden="true" className="h-4 w-4 shrink-0"/>View attendance<ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0"/></Link></div>
                </article>;
              })}
            </div>
            <Pagination page={currentPage} total={filteredAssistants.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} label="Student Assistants pagination" recordLabel="Assistants" />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Monthly recorded hours are separate from semester completion. Semester progress includes verified sessions, approved DTRs, and approved historical credits.
        {semesterData.data?.term && ` Current term: ${semesterData.data.term.academicYear} · ${semesterData.data.term.semester}.`}
      </p>
      </>}
    </>
  );
}
