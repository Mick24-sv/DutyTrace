import SemesterProgressOverview from '../../components/dashboard/SemesterProgressOverview.jsx';
import {LayoutDashboard as UIActionLayoutDashboard} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Users, Timer, ClipboardCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import DutyFollowUpOverview from '../../components/dashboard/DutyFollowUpOverview.jsx';
import WeeklyDutyOverview from '../../components/dashboard/WeeklyDutyOverview.jsx';
import DutyProgressOverview from '../../components/dashboard/DutyProgressOverview.jsx';
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
  const scheduleOverview = useApiData(user.office?.id ? `/duty-schedules/overview?refresh=${refresh}` : null);
  const assistants = data?.assistants ?? [];
  const monthColumns = data?.monthColumns ?? [];
  const studentsBelow = data?.studentsBelowRequirement ?? [];
  return <>
    <PageHeader icon={UIActionLayoutDashboard} title="Home" description={user.office ? `${user.office.name} · Attendance and reviews that need your attention.` : 'Ask an administrator to assign your office.'}>
      <div className="flex w-fit max-w-full self-start flex-wrap items-center gap-2 sm:ml-auto">
        <Link to="/supervisor/assistants" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white">View students</Link>
      </div>
    </PageHeader>
    {loading && <p role="status" className="mb-4 text-sm text-muted">Loading office overview…</p>}
    {error && <p role="alert" className="mb-4 text-sm text-bad-fg">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Assigned students" value={stats?.totalAssistants ?? '—'} icon={Users} />
      <StatCard label="Currently timed in" value={stats?.timedInToday ?? '—'} icon={Timer} />
      <StatCard label="DTRs awaiting review" value={stats?.pendingDtrs ?? '—'} icon={ClipboardCheck} />
    </div>
    <SemesterProgressOverview summary={data?.semesterSummary} role="supervisor" loading={loading} error={error} officeName={user.office?.name} />
    <Card className="mt-5" title="Next actions">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/supervisor/dtr-review" className="rounded-lg border border-line p-4 hover:bg-canvas"><b className="block text-sm text-teal">Review monthly DTRs</b><span className="mt-1 block text-sm text-muted">Approve hours or return a DTR with feedback.</span></Link>
        <Link to="/supervisor/discrepancies" className="rounded-lg border border-line p-4 hover:bg-canvas"><b className="block text-sm text-teal">Attendance corrections</b><span className="mt-1 block text-sm text-muted">{corrections.error ? 'Unable to load the correction count. Open the queue to retry.' : corrections.loading ? 'Loading correction requests…' : `${corrections.data?.pendingReview ?? 0} records awaiting review.`} To edit a student's times directly, open their attendance.</span></Link>
      </div>
    </Card>
    <DutyFollowUpOverview students={studentsBelow} loading={loading} error={error} />
    <WeeklyDutyOverview query={scheduleOverview} timezone={user.institution?.timezone || 'Asia/Manila'} assignedOffice={Boolean(user.office?.id)} />
    <DutyProgressOverview assistants={assistants} months={monthColumns} term={data?.semesterSummary?.term} loading={loading} error={error} />
    <Card className="mt-5" title="Office attendance" action={<Link to="/supervisor/assistants" className="text-sm text-teal underline">All students</Link>}>
      <DataTable rows={(data?.todayAttendance ?? []).slice(0, 7)} columns={[
        {key:'fullName',header:'Student'},
        {key:'state',header:'Status',render:row=><Badge tone={row.state === 'timed_in' ? 'pending' : 'neutral'}>{row.state === 'timed_in' ? 'Timed in' : 'Not timed in'}</Badge>},
      ]} empty="No office attendance to show." />
    </Card>
  </>;
}
