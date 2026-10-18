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
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours, formatTime } from '../../utils/format.js';

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData('/reports/dashboard-stats');

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
      header: 'Monthly Progress',
      render: (s) => (
        <div className="w-36">
          <ProgressBar value={s.recordedHours} max={s.requiredHours} label={`${s.recordedHours}h`} />
        </div>
      ),
    },
    {
      key: 'recorded',
      header: 'Recorded',
      render: (s) => <span className="font-mono text-sm">{formatHours(s.recordedHours)}</span>,
    },
    {
      key: 'deficit',
      header: 'Shortfall / Deficit',
      render: (s) => (
        <span className="font-mono text-sm text-bad-fg font-semibold">
          -{formatHours(s.remainingHours)}
        </span>
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

  const assistantsColumns = [
    {
      key: 'studentName',
      header: 'Student Assistant',
      render: (s) => (
        <Link to={`/supervisor/assistants/${s.id}`} className="font-medium text-ink hover:text-teal">
          {s.studentName}
        </Link>
      ),
    },
    {
      key: 'recordedHours',
      header: 'Recorded Hours',
      render: (s) => <span className="font-mono">{formatHours(s.recordedHours)}</span>,
    },
    {
      key: 'verifiedHours',
      header: 'Verified Hours',
      render: (s) => <span className="font-mono">{formatHours(s.verifiedHours)}</span>,
    },
    {
      key: 'incompleteSessions',
      header: 'Incomplete',
      render: (s) =>
        s.incompleteSessions > 0 ? (
          <Badge tone="rejected">{s.incompleteSessions} to check</Badge>
        ) : (
          <span className="text-muted text-xs">None</span>
        ),
    },
    {
      key: 'status',
      header: 'Requirement',
      render: (s) => (
        <Badge tone={s.meetsRequirement ? 'approved' : 'pending'}>
          {s.meetsRequirement ? 'Target Met' : 'Below Target'}
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
            to="/supervisor/reports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            <BarChart3 className="h-4 w-4 text-teal" />
            View Reports
          </Link>
          <Link
            to="/supervisor/scan"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal/90 transition"
          >
            <QrCode className="h-4 w-4" />
            Scan QR
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

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Assigned Assistants"
          value={loading ? '…' : stats.totalAssistants}
          hint={user?.office ? user.office.name : undefined}
          icon={Users}
        />
        <StatCard
          label="Today's Attendance"
          value={loading ? '…' : `${stats.timedInToday} / ${stats.totalAssistants}`}
          hint={stats.timedInToday > 0 ? `${stats.timedInToday} currently timed in` : 'None timed in yet today'}
          icon={Timer}
        />
        <StatCard
          label="Incomplete Records"
          value={loading ? '…' : stats.incompleteSessions}
          hint="Missing time-out or over length limit"
          icon={AlertTriangle}
        />
        <StatCard
          label="Pending DTR Reviews"
          value={loading ? '…' : stats.pendingDtrs}
          hint="Awaiting your review or revision check"
          icon={ClipboardCheck}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Below Duty Requirement"
          value={loading ? '…' : stats.studentsBelowRequirement}
          hint="Students behind monthly required hours"
          icon={TrendingDown}
        />
        <StatCard
          label="Absence Notices Attention"
          value={loading ? '…' : stats.absencesAwaitingReview}
          hint="Pending review or awaiting follow-up"
          icon={CalendarOff}
        />
        <StatCard
          label="Open Compliance Cases"
          value={loading ? '…' : stats.openCases}
          hint="Active cases in your office"
          icon={FolderCheck}
        />
      </div>

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
          <DataTable
            columns={todayColumns}
            rows={todayAttendance}
            caption="Today's live attendance status for your office"
            empty={loading ? 'Loading attendance…' : 'No student assistants assigned to your office.'}
          />
        </Card>

        <Card
          title="Students Below Duty-Hour Requirements"
          action={
            <Link to="/supervisor/reports" className="text-sm font-medium text-teal hover:underline">
              Detailed Hours Report
            </Link>
          }
        >
          <DataTable
            columns={belowColumns}
            rows={studentsBelow}
            caption="Students who have not yet reached monthly required hours"
            empty={
              loading
                ? 'Checking hours…'
                : 'All assigned assistants have met their monthly duty requirements!'
            }
          />
        </Card>
      </div>

      {/* Full Table: All Assigned Student Assistants */}
      <Card
        title="Student Assistants Duty Hours Summary"
        className="mt-6"
        action={
          <Link to="/supervisor/reports" className="text-sm font-medium text-teal hover:underline">
            Export Report
          </Link>
        }
      >
        <DataTable
          columns={assistantsColumns}
          rows={assistants}
          caption="Duty hours and DTR status for assigned student assistants"
          empty={loading ? 'Loading assistants…' : 'No assistants assigned to your office.'}
        />
        <p className="mt-3 text-xs text-muted">
          Only approved monthly DTRs establish official verified hours. Unapproved recorded hours are pending review.
        </p>
      </Card>
    </>
  );
}
