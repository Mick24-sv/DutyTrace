import SemesterStatusBadge from '../../components/attendance/SemesterStatusBadge.jsx';
import {LayoutDashboard as UIActionLayoutDashboard} from 'lucide-react';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Users, Timer, ClipboardCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { formatDutyTime, formatHours, formatMonth } from '../../utils/format.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';

export default function SupervisorDashboard() {
  const {user} = useAuth();
  const [refresh, setRefresh] = useState(0);
  const {data, loading, error} = useApiData(`/reports/dashboard-stats?refresh=${refresh}`);
  useEffect(() => {
    const refreshOverview=()=>setRefresh(value=>value+1);
    window.addEventListener('focus',refreshOverview);
    return ()=>window.removeEventListener('focus',refreshOverview);
  },[]);
  const corrections = useApiData('/attendance-discrepancies/summary');
  const stats = data?.stats;
  const scheduleOverview = useApiData(user.office?.id ? '/duty-schedules/overview' : null);
  const assistants = data?.assistants ?? [];
  const monthColumns = data?.monthColumns ?? [];
  const studentsBelow = data?.studentsBelowRequirement ?? [];
  const belowColumns = [
    { key: 'studentName', header: 'Student Assistant' },
    {key:'semesterStatus',header:'Semester status',render:s=><SemesterStatusBadge status={s.semesterStatus}/>},
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

  return <>
    <PageHeader icon={UIActionLayoutDashboard} title="Home" description={user.office ? `${user.office.name} · Attendance and reviews that need your attention.` : 'Ask an administrator to assign your office.'}>
      <div className="flex w-fit max-w-full self-start flex-wrap items-center gap-2 sm:ml-auto">
        <Link to="/supervisor/assistants" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white">View students</Link>
        <button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)} className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-line px-4 py-2 text-sm font-medium text-teal disabled:opacity-50">{loading?'Refreshing…':'Refresh overview'}</button>
      </div>
    </PageHeader>
    {loading && <p role="status" className="mb-4 text-sm text-muted">Loading office overview…</p>}
    {error && <p role="alert" className="mb-4 text-sm text-bad-fg">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Assigned students" value={stats?.totalAssistants ?? '—'} icon={Users} />
      <StatCard label="Currently timed in" value={stats?.timedInToday ?? '—'} icon={Timer} />
      <StatCard label="DTRs awaiting review" value={stats?.pendingDtrs ?? '—'} icon={ClipboardCheck} />
    </div>
    <Card className="mt-5" title="Next actions">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/supervisor/dtr-review" className="rounded-lg border border-line p-4 hover:bg-canvas"><b className="block text-sm text-teal">Review monthly DTRs</b><span className="mt-1 block text-sm text-muted">Approve hours or return a DTR with feedback.</span></Link>
        <Link to="/supervisor/discrepancies" className="rounded-lg border border-line p-4 hover:bg-canvas"><b className="block text-sm text-teal">Attendance corrections</b><span className="mt-1 block text-sm text-muted">{corrections.error ? 'Unable to load the correction count. Open the queue to retry.' : corrections.loading ? 'Loading correction requests…' : `${corrections.data?.pendingReview ?? 0} records awaiting review.`} To edit a student's times directly, open their attendance.</span></Link>
      </div>
    </Card>
        <Card
          className="mt-5"
          title="Students Below Duty-Hour Requirements"
          action={
            <Link to="/supervisor/reports?tab=semester-hours" className="text-sm font-medium text-teal hover:underline">
              Detailed Hours Report
            </Link>
          }
        >
          <div className="hidden 2xl:block">
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
          <div className="divide-y divide-line 2xl:hidden">
            {studentsBelow.length === 0 ? <p className="py-4 text-center text-sm text-muted">{loading ? 'Checking hours...' : 'No assigned semester requirements are currently below target.'}</p> : studentsBelow.map((student) => (
              <article key={student.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="break-words text-sm font-medium text-ink">{student.studentName}</p><SemesterStatusBadge status={student.semesterStatus}/>
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
      <Card title="Student Assistants’ preferred duty times" className="mt-4 mb-6" action={
        <Link to="/supervisor/schedule-review" className="text-sm font-medium text-teal hover:underline">Review preferences</Link>
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

      {/* Full Table: All Assigned Student Assistants */}
      <Card
        title="Monthly Duty Hours Summary"
        className="mt-4"
        action={<span className="whitespace-nowrap text-right text-xs text-muted">{data?.semesterSummary?.term ? `${data.semesterSummary.term.academicYear} · ${data.semesterSummary.term.semester}` : 'No active academic term'}</span>}
      >
        <p className="mb-3 text-xs text-muted">DTR verified shows the supervisor-approved monthly hours, including a documented final monthly total. QR recorded is shown separately. Total verified and hours left use approved DTRs plus historical credits within this semester.</p>
        <div className="hidden overflow-x-auto sm:block"><table className="min-w-max border-collapse text-left text-sm"><thead><tr>
          <th className="border border-line bg-canvas p-2">Student Assistant</th>
          <th className="border border-line bg-canvas p-2">Duty Hours Requirement</th>
          {monthColumns.map((month) => <th key={month} className="border border-line bg-canvas p-2">{formatMonth(month).toUpperCase()}</th>)}
          <th className="border border-line bg-canvas p-2">Hours Left</th>
          <th className="border border-line bg-canvas p-2">Total Verified (Semester)</th>
        </tr></thead><tbody>{assistants.map((assistant) => <tr key={assistant.id}>
          <th className="whitespace-nowrap border border-line p-2 font-medium">{assistant.studentName}<span className="mt-2 block"><SemesterStatusBadge status={assistant.semesterStatus}/></span></th>
          <td className="whitespace-nowrap border border-line p-2">{assistant.semesterRequirementAssigned ? formatHours(assistant.semesterRequiredHours) : 'No requirement'}</td>
          {monthColumns.map((month) => <td key={month} className="whitespace-nowrap border border-line p-2 align-top"><span className="block text-[10px] text-muted">DTR verified</span><span className="block font-semibold text-navy">{assistant.monthlyDtrStatuses?.[month]==='approved' ? formatHours(assistant.monthlyVerifiedHours?.[month]??0) : (assistant.monthlyHours?.[month]??0)>0 ? 'Pending approval' : formatHours(0)}</span><span className="mt-2 block text-[10px] text-muted">QR recorded</span>{formatHours(assistant.monthlyHours?.[month] ?? 0)}<span className="mt-1 block text-[10px] text-muted">Historical verified</span>{formatHours(assistant.historicalMonthlyHours?.[month] ?? 0)}</td>)}
          <td className="whitespace-nowrap border border-line p-2">{assistant.recordedHoursLeft == null ? '—' : formatHours(assistant.recordedHoursLeft)}</td>
          <td className="whitespace-nowrap border border-line p-2 font-semibold">{formatHours(assistant.semesterVerifiedHours ?? 0)}</td>
        </tr>)}</tbody></table></div>
        <div className="space-y-3 sm:hidden">{assistants.map((assistant) => <article key={assistant.id} className="rounded-lg border border-line p-3">
          <h3 className="break-words text-sm font-semibold">{assistant.studentName}</h3><div className="mt-2"><SemesterStatusBadge status={assistant.semesterStatus}/></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Duty hours requirement</dt><dd className="mt-1 font-semibold text-ink">{assistant.semesterRequirementAssigned ? formatHours(assistant.semesterRequiredHours) : 'No requirement'}</dd></div>
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Hours left</dt><dd className="mt-1 font-semibold text-ink">{assistant.recordedHoursLeft == null ? '—' : formatHours(assistant.recordedHoursLeft)}</dd></div>
            <div className="rounded-md bg-canvas p-2"><dt className="text-muted">Total verified this semester</dt><dd className="mt-1 font-semibold text-ink">{formatHours(assistant.semesterVerifiedHours ?? 0)}</dd></div>
          </dl>
          {monthColumns.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-semibold text-muted">Hours by month</p><dl className="grid gap-2">{monthColumns.map((month) => <div key={month} className="min-w-0 rounded-md border border-line p-3 text-xs"><dt className="mb-2 font-semibold text-navy">{formatMonth(month)}</dt><dd className="grid grid-cols-2 gap-3"><span><span className="block text-muted">DTR verified</span><b className="mt-1 block text-navy">{assistant.monthlyDtrStatuses?.[month]==='approved' ? formatHours(assistant.monthlyVerifiedHours?.[month]??0) : (assistant.monthlyHours?.[month]??0)>0 ? 'Pending approval' : formatHours(0)}</b></span><span><span className="block text-muted">Historical verified</span><span className="mt-1 block">{formatHours(assistant.historicalMonthlyHours?.[month]??0)}</span></span><span className="col-span-2 text-muted">QR recorded: {formatHours(assistant.monthlyHours?.[month]??0)}</span></dd></div>)}</dl></div>}
        </article>)}</div>
        {assistants.length === 0 && <p className="py-4 text-center text-sm text-muted">{loading ? 'Loading hour summaries…' : 'No assistants assigned to your office.'}</p>}
      </Card>

    <Card className="mt-5" title="Office attendance" action={<Link to="/supervisor/assistants" className="text-sm text-teal underline">All students</Link>}>
      <DataTable rows={(data?.todayAttendance ?? []).slice(0, 7)} columns={[
        {key:'fullName',header:'Student'},
        {key:'state',header:'Status',render:row=><Badge tone={row.state === 'timed_in' ? 'pending' : 'neutral'}>{row.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge>},
      ]} empty="No office attendance to show." />
    </Card>
  </>;
}
