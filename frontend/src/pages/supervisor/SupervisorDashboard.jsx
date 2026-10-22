import { Link } from 'react-router-dom';
import {
  Users,
  Timer,
  AlertTriangle,
  ClipboardCheck,
  CalendarOff,
  FolderCheck,
  TrendingDown,
  BarChart3,
  QrCode,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDutyTime, formatHours, formatMonth, formatTime } from '../../utils/format.js';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData('/reports/dashboard-stats');
  const scheduleOverview = useApiData('/duty-schedules/overview');
  const forecastData = useApiData(user?.office?.id ? `/forecast/office/${user.office.id}` : null);
  const recoveryData = useApiData('/recovery/review');
  const discrepancySummary = useApiData('/attendance-discrepancies/summary');

  const stats = data?.stats ?? {
    totalAssistants: 0,
    timedInToday: 0,
    incompleteSessions: 0,
    pendingDtrs: 0,
    absencesAwaitingReview: 0,
    studentsBelowRequirement: 0,
    openCases: 0,
  };

  const assistants = data?.assistants ?? [];
  const monthColumns = data?.monthColumns ?? [];
  const todayAttendance = data?.todayAttendance ?? [];
  const studentsBelow = data?.studentsBelowRequirement ?? [];

  const todayColumns = [
    { key: 'fullName', header: 'Student Assistant' },
    { key: 'email', header: 'Email' },
    {
      key: 'state',
      header: 'Today’s Status',
      render: (a) => (
        <Badge tone={a.state === 'timed_in' ? 'pending' : 'neutral'}>
          {a.state === 'timed_in' ? 'Timed In' : 'Not Timed In'}
        </Badge>
      ),
    },
    {
      key: 'since',
      header: 'Event Time',
      render: (a) => (a.since ? formatTime(a.since) : '—'),
    },
  ];

  const belowColumns = [
    { key: 'studentName', header: 'Student Assistant' },
    {
      key: 'progress',
      header: 'Semester Progress',
      render: (s) => (
        <div className="w-36">
          {s.semesterRequirementAssigned
            ? <ProgressBar value={s.semesterVerifiedHours} max={s.semesterRequiredHours} label={`${s.semesterVerifiedHours}h`} />
            : <span className="text-xs text-muted">No semester target</span>}
        </div>
      ),
    },
    {
      key: 'recorded',
      header: 'Recorded (Month)',
      render: (s) => <span className="font-mono text-sm">{formatHours(s.recordedHours)}</span>,
    },
    {
      key: 'semesterVerifiedHours',
      header: 'Verified (Semester)',
      render: (s) => <span className="font-mono text-sm">{formatHours(s.semesterVerifiedHours)}</span>,
    },
    {
      key: 'semesterRemainingHours',
      header: 'Semester Remaining',
      render: (s) => (
        s.semesterRequirementAssigned
          ? <span className="font-mono text-sm text-bad-fg font-semibold">{formatHours(s.semesterRemainingHours)}</span>
          : <span className="text-xs text-muted">No requirement assigned</span>
      ),
    },
    {
      key: 'dtrStatus',
      header: 'DTR Status',
      render: (s) => (
        <Badge tone={s.dtrStatus === 'approved' ? 'approved' : s.dtrStatus === 'none' ? 'neutral' : 'pending'}>
          {s.dtrStatus}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Supervisor Dashboard"
        description={
          user?.office
            ? `${user.office.name} (${user.office.code}). Scoped strictly to your authorized office.`
            : 'You are not assigned to an office yet. Contact an administrator.'
        }
      >
        <div className="flex flex-wrap gap-2">
          <Link
            to="/supervisor/duty-schedules"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            <CalendarDays className="h-4 w-4 text-teal" />
            Review duty schedules
          </Link>
          <Link
            to="/supervisor/recovery-review"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            <CalendarDays className="h-4 w-4 text-teal" />
            Recovery requests{recoveryData.data?.plans?.filter((plan) => plan.status === 'pending_review').length ? ` (${recoveryData.data.plans.filter((plan) => plan.status === 'pending_review').length})` : ''}
          </Link>
          <Link
            to="/supervisor/reports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            <BarChart3 className="h-4 w-4 text-teal" />
            View Reports
          </Link>
          <Link
            to="/supervisor/office-qr"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal/90 transition"
          >
            <QrCode className="h-4 w-4" />
            Show Office QR
          </Link>
        </div>
      </PageHeader>

      {error && (
        <div role="alert" className="mb-6 rounded-lg bg-bad-bg p-4 text-sm text-bad-fg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load supervisor dashboard data</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      <Card title="Student Assistants’ preferred duty times" className="mb-6" action={
        <Link to="/supervisor/duty-schedules" className="text-sm font-medium text-teal hover:underline">Review preferences</Link>
      }>
        {scheduleOverview.loading && <p role="status" className="text-sm text-muted">Loading submitted preferences…</p>}
        {scheduleOverview.error && <p role="alert" className="text-sm text-bad-fg">Unable to load schedule preferences: {scheduleOverview.error}</p>}
        {!scheduleOverview.loading && !scheduleOverview.error && scheduleOverview.data?.schedules?.length > 0 && <>
          <p className="mb-3 text-sm text-muted">{scheduleOverview.data.term ? `${scheduleOverview.data.term.academicYear} · ${scheduleOverview.data.term.semester} — submitted and approved weekly schedules` : 'Current term'}</p>
          <div className="hidden overflow-x-auto sm:block"><table className="min-w-max border-collapse text-left text-sm"><thead><tr>
            <th className="border border-line bg-canvas p-2">Student Assistant</th>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => <th key={day} className="border border-line bg-canvas p-2">{day.slice(0, 3)}</th>)}
          </tr></thead><tbody>{scheduleOverview.data.schedules.map((schedule) => <tr key={schedule.id}>
            <th className="border border-line p-2 font-medium">{schedule.studentName}<span className="block text-xs font-normal capitalize text-muted">{schedule.status.replaceAll('_', ' ')}</span></th>
            {Array.from({ length: 6 }, (_, index) => {
              const day = schedule.days.find((item) => item.weekday === index + 1);
              return <td key={index} className="min-w-28 border border-line p-2 align-top">{day ? <>
                <span>{formatDutyTime(day.startsAt)}–{formatDutyTime(day.endsAt)}</span>
                {day.afternoonStartsAt && <span className="block">{formatDutyTime(day.afternoonStartsAt)}–{formatDutyTime(day.afternoonEndsAt)}</span>}
              </> : <span className="text-muted">Not available</span>}</td>;
            })}
          </tr>)}</tbody></table></div>
          <div className="space-y-3 sm:hidden">{scheduleOverview.data.schedules.map((schedule) => <article key={schedule.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{schedule.studentName}</h3><Badge tone={schedule.status === 'approved' ? 'approved' : 'pending'}>{schedule.status.replaceAll('_', ' ')}</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-2">{schedule.days.map((day) => <div key={day.weekday} className="min-w-0 rounded-md bg-canvas p-2">
              <p className="text-xs font-semibold">{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.weekday - 1]}</p>
              <p className="mt-1 break-words text-xs text-muted">{formatDutyTime(day.startsAt)}–{formatDutyTime(day.endsAt)}</p>
              {day.afternoonStartsAt && <p className="break-words text-xs text-muted">{formatDutyTime(day.afternoonStartsAt)}–{formatDutyTime(day.afternoonEndsAt)}</p>}
            </div>)}</div>
          </article>)}</div>
          <p className="mt-2 text-xs text-muted">Times are student preferences unless status is approved. Approval checks schedule overlaps and office capacity.</p>
        </>}
        {!scheduleOverview.loading && !scheduleOverview.error && !scheduleOverview.data?.schedules?.length && <p className="text-sm text-muted">No submitted or approved preferences for the current term.</p>}
      </Card>

      <Card title="Attendance discrepancy review" className="mb-6" action={<Link to="/supervisor/discrepancies" className="text-sm font-medium text-teal hover:underline">Open review queue</Link>}>
        <p className="text-sm text-muted">Review student explanations and correction requests for your office. Original QR records stay unchanged.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm"><Badge tone="pending">{discrepancySummary.data?.pendingReview??0} pending review</Badge><Badge tone="neutral">{discrepancySummary.data?.open??0} unresolved</Badge></div>
        {discrepancySummary.error&&<p className="mt-2 text-xs text-bad-fg">Could not load discrepancy counts: {discrepancySummary.error}</p>}
      </Card>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          compact
          label="Assigned Assistants"
          value={loading ? '…' : stats.totalAssistants}
          hint={user?.office ? user.office.name : undefined}
          icon={Users}
        />
        <StatCard
          compact
          label="Today's Attendance"
          value={loading ? '…' : `${stats.timedInToday} / ${stats.totalAssistants}`}
          hint={stats.timedInToday > 0 ? `${stats.timedInToday} currently timed in` : 'None timed in yet today'}
          icon={Timer}
        />
        <StatCard
          compact
          label="Incomplete Records"
          value={loading ? '…' : stats.incompleteSessions}
          hint="Missing time-out or over length limit"
          icon={AlertTriangle}
        />
        <StatCard
          compact
          label="Pending DTR Reviews"
          value={loading ? '…' : stats.pendingDtrs}
          hint="Awaiting your review or revision check"
          icon={ClipboardCheck}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-3">
        <StatCard
          compact
          label="Below Duty Requirement"
          value={loading ? '…' : stats.studentsBelowRequirement}
          hint={data?.semesterSummary?.term ? `${data.semesterSummary.term.academicYear} · ${data.semesterSummary.term.semester} requirements not met` : 'No active academic term'}
          icon={TrendingDown}
        />
        <StatCard
          compact
          label="Absence Notices Attention"
          value={loading ? '…' : stats.absencesAwaitingReview}
          hint="Pending review or awaiting follow-up"
          icon={CalendarOff}
        />
        <StatCard
          compact
          label="Open Compliance Cases"
          value={loading ? '…' : stats.openCases}
          hint="Active cases in your office"
          icon={FolderCheck}
        />
      </div>

      {/* Duty Completion Forecast Overview Card */}
      <Card
        className="mt-6"
        title="Duty completion forecast overview"
        action={
          <Link to="/supervisor/assistants" className="text-sm font-medium text-teal hover:underline">
            View all assistant forecasts
          </Link>
        }
      >
        {forecastData.loading && <p className="text-sm text-muted">Loading forecast data…</p>}
        {forecastData.error && <p className="text-sm text-bad-fg">Unable to load forecast: {forecastData.error}</p>}
        {forecastData.data && (
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <div className="flex min-h-24 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-canvas p-3 text-left sm:items-center sm:text-center">
                <span className="text-xs text-muted block">On Track</span>
                <span className="mt-1 block text-xl font-semibold text-ok-fg font-mono">
                  {forecastData.data.summary.onTrack}
                </span>
                <span className="block text-[11px] leading-snug text-muted">Projected on/before deadline</span>
              </div>
              <div className="flex min-h-24 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-canvas p-3 text-left sm:items-center sm:text-center">
                <span className="text-xs text-muted block">At Risk</span>
                <span className="mt-1 block text-xl font-semibold text-bad-fg font-mono">
                  {forecastData.data.summary.atRisk}
                </span>
                <span className="block text-[11px] leading-snug text-muted">Behind pace or past deadline</span>
              </div>
              <div className="flex min-h-24 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-canvas p-3 text-left sm:items-center sm:text-center">
                <span className="text-xs text-muted block">Completed</span>
                <span className="mt-1 block text-xl font-semibold text-teal font-mono">
                  {forecastData.data.summary.completed}
                </span>
                <span className="block text-[11px] leading-snug text-muted">Requirements met</span>
              </div>
              <div className="flex min-h-24 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-canvas p-3 text-left sm:items-center sm:text-center">
                <span className="text-xs text-muted block">Insufficient Data</span>
                <span className="mt-1 block text-xl font-semibold text-muted font-mono">
                  {forecastData.data.summary.insufficientData}
                </span>
                <span className="block text-[11px] leading-snug text-muted">Need initial attendance history</span>
              </div>
            </div>

            {forecastData.data.items?.filter((item) => item.status === 'at_risk').length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-bad-fg">
                  Students Requiring Attention (At Risk)
                </p>
                <div className="divide-y divide-line rounded-lg border border-line bg-surface">
                  {forecastData.data.items
                    .filter((item) => item.status === 'at_risk')
                    .slice(0, 5)
                    .map((item) => (
                      <div key={item.student.id} className="grid min-w-0 gap-2 p-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                        <div className="min-w-0">
                          <span className="font-medium text-ink">{item.student.fullName}</span>
                          <span className="ml-2 text-xs text-muted">({item.remainingHours}h remaining)</span>
                          <p className="mt-1 break-words text-xs leading-relaxed text-bad-fg">{item.reason}</p>
                        </div>
                        <div className="text-left text-xs text-muted font-mono md:text-right">
                          {item.actualWeeklyPace} h/wk actual · {item.requiredWeeklyPace} h/wk required
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Two-column layout for Today's Attendance and Students Below Requirement */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Today's Attendance Overview"
          action={
            <Link to="/supervisor/assistants" className="text-sm font-medium text-teal hover:underline">
              All Assistants
            </Link>
          }
        >
          <div className="hidden sm:block">
          <DataTable
            columns={todayColumns}
            rows={todayAttendance}
            caption="Today's live attendance status for your office"
            empty={loading ? 'Loading attendance…' : 'No student assistants assigned to your office.'}
          />
          </div>
          <div className="divide-y divide-line sm:hidden">
            {todayAttendance.length === 0 ? <p className="py-4 text-center text-sm text-muted">{loading ? 'Loading attendance...' : 'No student assistants assigned to your office.'}</p> : todayAttendance.map((assistant) => (
              <div key={assistant.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{assistant.fullName}</p>
                  <p className="break-all text-xs text-muted">{assistant.email}</p>
                  {assistant.since && <p className="mt-1 text-xs text-muted">Event time: {formatTime(assistant.since)}</p>}
                </div>
                <Badge tone={assistant.state === 'timed_in' ? 'pending' : 'neutral'}>{assistant.state === 'timed_in' ? 'Timed In' : 'Not Timed In'}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Students Below Duty-Hour Requirements"
          action={
            <Link to="/supervisor/reports" className="text-sm font-medium text-teal hover:underline">
              Detailed Hours Report
            </Link>
          }
        >
          <div className="hidden sm:block">
          <DataTable
            columns={belowColumns}
            rows={studentsBelow}
            caption="Students who have not yet reached their assigned semester hours"
            empty={
              loading
                ? 'Checking hours…'
                : 'No assigned semester requirements are currently below target.'
            }
          />
          </div>
          <div className="divide-y divide-line sm:hidden">
            {studentsBelow.length === 0 ? <p className="py-4 text-center text-sm text-muted">{loading ? 'Checking hours...' : 'No assigned semester requirements are currently below target.'}</p> : studentsBelow.map((student) => (
              <article key={student.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="break-words text-sm font-medium text-ink">{student.studentName}</p>
                {student.semesterRequirementAssigned && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted"><span>Semester progress</span><span>{student.completionPercentage ?? 0}%</span></div>
                    <ProgressBar value={student.semesterVerifiedHours} max={student.semesterRequiredHours} label={`${student.semesterVerifiedHours} h`} />
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-muted">Recorded this month</dt><dd className="mt-0.5 font-mono text-ink">{formatHours(student.recordedHours)}</dd></div>
                  <div><dt className="text-muted">Verified this semester</dt><dd className="mt-0.5 font-mono text-ink">{formatHours(student.semesterVerifiedHours)}</dd></div>
                  <div><dt className="text-muted">Semester remaining</dt><dd className="mt-0.5 font-mono text-bad-fg">{student.semesterRequirementAssigned ? formatHours(student.semesterRemainingHours) : 'No requirement assigned'}</dd></div>
                  <div><dt className="text-muted">DTR status</dt><dd className="mt-0.5"><Badge tone={student.dtrStatus === 'approved' ? 'approved' : student.dtrStatus === 'none' ? 'neutral' : 'pending'}>{student.dtrStatus}</Badge></dd></div>
                </dl>
              </article>
            ))}
          </div>
        </Card>
      </div>

      {/* Full Table: All Assigned Student Assistants */}
      <Card
        title="Monthly Duty Hours Summary"
        className="mt-6"
        action={<span className="whitespace-nowrap text-right text-xs text-muted">{data?.semesterSummary?.term ? `${data.semesterSummary.term.academicYear} · ${data.semesterSummary.term.semester}` : 'No active academic term'}</span>}
      >
        <p className="mb-3 text-xs text-muted">Monthly completed hours are calculated from attendance records. Hours left use the assigned semester requirement and these recorded hours.</p>
        <div className="hidden overflow-x-auto sm:block"><table className="min-w-max border-collapse text-left text-sm"><thead><tr>
          <th className="border border-line bg-canvas p-2">Student Assistant</th>
          <th className="border border-line bg-canvas p-2">Duty Hours Requirement</th>
          {monthColumns.map((month) => <th key={month} className="border border-line bg-canvas p-2">{formatMonth(month).toUpperCase()}</th>)}
          <th className="border border-line bg-canvas p-2">Hours Left</th>
          <th className="border border-line bg-canvas p-2">Total Hours</th>
        </tr></thead><tbody>{assistants.map((assistant) => <tr key={assistant.id}>
          <th className="whitespace-nowrap border border-line p-2 font-medium">{assistant.studentName}</th>
          <td className="whitespace-nowrap border border-line p-2">{assistant.semesterRequirementAssigned ? formatHours(assistant.semesterRequiredHours) : 'No requirement'}</td>
          {monthColumns.map((month) => <td key={month} className="whitespace-nowrap border border-line p-2">{formatHours(assistant.monthlyHours?.[month] ?? 0)}</td>)}
          <td className="whitespace-nowrap border border-line p-2">{assistant.recordedHoursLeft == null ? '—' : formatHours(assistant.recordedHoursLeft)}</td>
          <td className="whitespace-nowrap border border-line p-2 font-semibold">{formatHours(assistant.totalRecordedTermHours ?? 0)}</td>
        </tr>)}</tbody></table></div>
        <div className="space-y-3 sm:hidden">{assistants.map((assistant) => <article key={assistant.id} className="rounded-lg border border-line p-3">
          <h3 className="break-words text-sm font-semibold">{assistant.studentName}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Duty hours requirement</dt><dd className="mt-1 font-semibold text-ink">{assistant.semesterRequirementAssigned ? formatHours(assistant.semesterRequiredHours) : 'No requirement'}</dd></div>
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Hours left</dt><dd className="mt-1 font-semibold text-ink">{assistant.recordedHoursLeft == null ? '—' : formatHours(assistant.recordedHoursLeft)}</dd></div>
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Total hours</dt><dd className="mt-1 font-semibold text-ink">{formatHours(assistant.totalRecordedTermHours ?? 0)}</dd></div>
          </dl>
          {monthColumns.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-semibold text-muted">Completed by month</p><dl className="grid grid-cols-2 gap-2">{monthColumns.map((month) => <div key={month} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5 text-xs"><dt className="truncate text-muted">{formatMonth(month)}</dt><dd className="whitespace-nowrap font-medium">{formatHours(assistant.monthlyHours?.[month] ?? 0)}</dd></div>)}</dl></div>}
        </article>)}</div>
        {assistants.length === 0 && <p className="py-4 text-center text-sm text-muted">{loading ? 'Loading hour summaries…' : 'No assistants assigned to your office.'}</p>}
      </Card>

    </>
  );
}
