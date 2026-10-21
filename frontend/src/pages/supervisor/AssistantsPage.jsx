import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const officeId = user.office?.id;
  const monthData = useApiData(
    officeId ? `/attendance/office/${officeId}/summary${month ? `?month=${month}` : ''}` : null,
  );
  const semesterData = useApiData(officeId ? '/semesters/current/office' : null);
  const forecastData = useApiData(officeId ? `/forecast/office/${officeId}` : null);
  const data = monthData.data;
  const loading = monthData.loading || semesterData.loading || forecastData.loading;
  const error = monthData.error || semesterData.error || forecastData.error;
  const semesterStudents = new Map((semesterData.data?.students ?? []).map((student) => [student.id, student]));
  const forecastsByStudent = new Map((forecastData.data?.items ?? []).map((f) => [f.student.id, f]));
  const filteredAssistants = (data?.assistants ?? []).filter((assistant) => {
    const semester = semesterStudents.get(assistant.id);
    return [assistant.fullName, assistant.email, assistant.state, semester?.requirementAssigned ? 'requirement assigned' : 'no requirement', assistant.totals.recordedHours]
      .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase()));
  });

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
      key: 'semesterHours', header: 'Semester verified / remaining',
      render: (a) => {
        const semester = semesterStudents.get(a.id);
        if (!semester) return '—';
        if (!semester.requirementAssigned) return <span className="text-xs text-muted">No requirement assigned</span>;
        return `${formatHours(semester.verifiedHours)} / ${formatHours(semester.remainingHours)} h remaining`;
      },
    },
    {
      key: 'forecast',
      header: 'Completion Forecast',
      render: (a) => {
        const f = forecastsByStudent.get(a.id);
        if (!f) return <span className="text-xs text-muted">—</span>;
        return (
          <div className="space-y-0.5" title={f.reason}>
            <Badge tone={f.statusTone || 'neutral'}>{f.statusLabel}</Badge>
            {f.projectedCompletionDate ? (
              <span className="block text-[11px] font-mono text-ink">
                Proj: {f.projectedCompletionDate}
              </span>
            ) : f.actualWeeklyPace > 0 ? (
              <span className="block text-[10px] text-muted">
                {f.actualWeeklyPace} h/wk
              </span>
            ) : null}
          </div>
        );
      },
    },
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
      <PageHeader title="Student Assistants" description={user.office ? `${user.office.name}: monthly attendance and current semester requirement progress.` : undefined}>
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
          <>
            {forecastData.data?.summary && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-line bg-canvas p-2.5 text-center">
                  <span className="text-xs text-muted block">On Track</span>
                  <span className="text-lg font-semibold text-ok-fg font-mono">{forecastData.data.summary.onTrack}</span>
                </div>
                <div className="rounded-lg border border-line bg-canvas p-2.5 text-center">
                  <span className="text-xs text-muted block">At Risk</span>
                  <span className="text-lg font-semibold text-bad-fg font-mono">{forecastData.data.summary.atRisk}</span>
                </div>
                <div className="rounded-lg border border-line bg-canvas p-2.5 text-center">
                  <span className="text-xs text-muted block">Completed</span>
                  <span className="text-lg font-semibold text-teal font-mono">{forecastData.data.summary.completed}</span>
                </div>
                <div className="rounded-lg border border-line bg-canvas p-2.5 text-center">
                  <span className="text-xs text-muted block">Insufficient Data</span>
                  <span className="text-lg font-semibold text-muted font-mono">{forecastData.data.summary.insufficientData}</span>
                </div>
              </div>
            )}
            <label htmlFor="assistant-search" className="sr-only">Search Student Assistants</label>
            <div className="relative mb-3 w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="assistant-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assistants" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
            </div>
            <div className="hidden sm:block">
              <DataTable columns={columns} rows={filteredAssistants} caption="Student assistants in your office" empty={search ? 'No matching assistants.' : 'No Student Assistants are assigned to your office.'} />
            </div>
            <div className="divide-y divide-line sm:hidden">
              {filteredAssistants.length === 0 ? <p className="py-5 text-center text-sm text-muted">{search ? 'No matching assistants.' : 'No Student Assistants are assigned to your office.'}</p> : filteredAssistants.map((assistant) => {
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
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-muted">Recorded this month</dt><dd className="mt-0.5 font-mono text-ink">{formatHours(assistant.totals.recordedHours)}</dd></div>
                      <div><dt className="text-muted">Need attention</dt><dd className="mt-0.5">{assistant.totals.incompleteCount > 0 ? <Badge tone="rejected">{assistant.totals.incompleteCount} to review</Badge> : <span className="text-muted">None</span>}</dd></div>
                      <div className="col-span-2"><dt className="text-muted">Semester verified / remaining</dt><dd className="mt-0.5 font-mono text-ink">{!semester ? '—' : !semester.requirementAssigned ? 'No requirement assigned' : `${formatHours(semester.verifiedHours)} / ${formatHours(semester.remainingHours)} remaining`}</dd></div>
                      {forecastsByStudent.get(assistant.id) && (
                        <div className="col-span-2">
                          <dt className="text-muted">Completion forecast</dt>
                          <dd className="mt-1 flex items-center gap-2">
                            <Badge tone={forecastsByStudent.get(assistant.id).statusTone || 'neutral'}>
                              {forecastsByStudent.get(assistant.id).statusLabel}
                            </Badge>
                            {forecastsByStudent.get(assistant.id).projectedCompletionDate && (
                              <span className="text-xs font-mono text-ink">
                                Proj: {forecastsByStudent.get(assistant.id).projectedCompletionDate}
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <Link to={assistant.id} className="inline-flex min-h-10 items-center font-medium text-teal underline">View history</Link>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Monthly recorded hours are separate from semester completion. Only hours verified by approved DTRs count toward semester requirements.
        {semesterData.data?.term && ` Current term: ${semesterData.data.term.academicYear} · ${semesterData.data.term.semester}.`}
      </p>
    </>
  );
}
