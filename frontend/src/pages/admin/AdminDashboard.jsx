import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Timer,
  FileText,
  FolderCheck,
  CalendarOff,
  Files,
  TrendingDown,
  BarChart3,
  Clock,
  AlertCircle,
  Settings,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours, formatMonth } from '../../utils/format.js';

export default function AdminDashboard() {
  const { data, loading, error } = useApiData('/reports/dashboard-stats');

  const users = data?.users ?? { total: 0, active: 0, students: 0, supervisors: 0 };
  const offices = data?.offices ?? { total: 0, active: 0 };
  const attendance = data?.attendance ?? { timedInNow: 0, recordedHoursCurrentMonth: 0, verifiedHoursCurrentMonth: 0 };
  const dtrs = data?.dtrs ?? { allTime: {}, currentMonth: {}, pendingReview: 0 };
  const hours = data?.hoursSummary ?? {
    requiredMonthlyHours: 40,
    totalRecordedHours: 0,
    totalVerifiedHours: 0,
    studentsMetRequirement: 0,
    studentsBelowRequirement: 0,
  };
  const cases = data?.cases ?? { activeTotal: 0, open: 0, documentsPending: 0, underReview: 0, needsCorrection: 0, resolved: 0, closed: 0 };
  const absences = data?.absences ?? { pendingReview: 0, pending: 0, acknowledged: 0, reviewed: 0, needsFollowUp: 0 };
  const docs = data?.documents ?? { total: 0, online: 0, manual: 0 };
  const semester = data?.semesterSummary ?? {
    term: null,
    totalRecordedHours: 0,
    totalVerifiedHours: 0,
    totalRequiredHours: 0,
    studentsMetRequirement: 0,
    studentsBelowRequirement: 0,
  };

  const dtrStatusRows = [
    { id: 'submitted', label: 'Submitted (Awaiting Review)', current: dtrs.currentMonth?.submitted ?? 0, total: dtrs.allTime?.submitted ?? 0, tone: 'pending' },
    { id: 'under_review', label: 'Under Review', current: dtrs.currentMonth?.under_review ?? 0, total: dtrs.allTime?.under_review ?? 0, tone: 'info' },
    { id: 'approved', label: 'Approved (Verified)', current: dtrs.currentMonth?.approved ?? 0, total: dtrs.allTime?.approved ?? 0, tone: 'approved' },
    { id: 'needs_correction', label: 'Returned for Correction', current: dtrs.currentMonth?.needs_correction ?? 0, total: dtrs.allTime?.needs_correction ?? 0, tone: 'rejected' },
    { id: 'draft', label: 'Draft (Not Submitted)', current: dtrs.currentMonth?.draft ?? 0, total: dtrs.allTime?.draft ?? 0, tone: 'neutral' },
  ];

  const dtrColumns = [
    { key: 'label', header: 'DTR Status' },
    {
      key: 'indicator',
      header: 'Indicator',
      render: (r) => <Badge tone={r.tone}>{r.label.split(' ')[0]}</Badge>,
    },
    { key: 'current', header: 'This Month', render: (r) => <span className="font-semibold">{r.current}</span> },
    { key: 'total', header: 'All-Time Total', render: (r) => <span className="text-muted">{r.total}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Administrator Dashboard"
        description="Institutional overview: users, duty attendance, DTR reviews, compliance cases, and document audits."
      >
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/reports"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal/90 transition"
          >
            <BarChart3 className="h-4 w-4" />
            Institutional Reports
          </Link>
          <Link
            to="/admin/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            <Settings className="h-4 w-4 text-muted" />
            Policy Settings
          </Link>
          <Link
            to="/admin/semesters"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas transition"
          >
            Academic Terms
          </Link>
        </div>
      </PageHeader>

      {error && (
        <div role="alert" className="mb-6 rounded-lg bg-bad-bg p-4 text-sm text-bad-fg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load administrator metrics</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Row 1: High Level System KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Users"
          value={loading ? '…' : users.total}
          hint={loading ? '…' : `${users.students} students, ${users.supervisors} supervisors`}
          icon={Users}
        />
        <StatCard
          label="Active Offices"
          value={loading ? '…' : `${offices.active} / ${offices.total}`}
          hint="Participating campus units"
          icon={Building2}
        />
        <StatCard
          label="Active Attendance"
          value={loading ? '…' : `${attendance.timedInNow} timed in`}
          hint="Live duty assistants right now"
          icon={Timer}
        />
        <StatCard
          label="Open Compliance Cases"
          value={loading ? '…' : cases.activeTotal}
          hint={loading ? '…' : `${cases.needsCorrection} need correction`}
          icon={FolderCheck}
        />
      </div>

      {/* Row 2: Hours & Queue KPIs */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recorded Hours (This Month)"
          value={loading ? '…' : formatHours(hours.totalRecordedHours)}
          hint="System-wide attendance recorded"
          icon={Clock}
        />
        <StatCard
          label="Verified Hours (Approved DTRs)"
          value={loading ? '…' : formatHours(hours.totalVerifiedHours)}
          hint="Officially credited duty hours"
          icon={FileText}
        />
        <StatCard
          label="Students Below Semester Requirement"
          value={loading ? '…' : semester.studentsBelowRequirement}
          hint={loading ? '…' : semester.term ? `${semester.term.academicYear} · ${semester.term.semester}` : 'No active academic term'}
          icon={TrendingDown}
        />
        <StatCard
          label="DTRs Awaiting Review"
          value={loading ? '…' : dtrs.pendingReview}
          hint="Across all academic offices"
          icon={BarChart3}
        />
      </div>

      {/* Middle Section: DTR Breakdown and Hours Summary */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          title="Monthly DTR Status Breakdown"
          className="lg:col-span-2"
          action={
            <Link to="/admin/dtrs" className="text-sm font-medium text-teal hover:underline">
              View All DTRs
            </Link>
          }
        >
          <DataTable
            columns={dtrColumns}
            rows={dtrStatusRows}
            caption="Monthly DTR counts grouped by review status"
            empty={loading ? 'Loading status…' : 'No DTRs recorded in the database.'}
          />
        </Card>

        {/* Recorded vs. Verified Hours Summary */}
        <Card
          title="Monthly DTR Hours & Semester Requirements"
          action={
            <Link to="/admin/reports" className="text-sm font-medium text-teal hover:underline">
              Detailed Report
            </Link>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted">Recorded this month (DTR):</span>
                <span className="font-semibold">{formatHours(hours.totalRecordedHours)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted">Verified this month (DTR):</span>
                <span className="font-semibold text-ok-fg">{formatHours(hours.totalVerifiedHours)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-line pt-1">
                <span className="text-muted">Unverified Variance:</span>
                <span className="font-semibold text-warn-fg">
                  {formatHours(Math.max(0, hours.totalRecordedHours - hours.totalVerifiedHours))}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-canvas p-3">
              <p className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">
                Semester Progress{semester.term ? ` · ${semester.term.academicYear} ${semester.term.semester}` : ''}
              </p>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>Students Met Requirement:</span>
                <span className="font-bold text-ok-fg">{semester.studentsMetRequirement}</span>
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>Students Below Requirement:</span>
                <span className="font-bold text-bad-fg">{semester.studentsBelowRequirement}</span>
              </div>
            </div>

            <p className="text-xs text-muted">
              Monthly DTRs remain separate. Semester requirement targets are individually assigned under Academic Terms.
            </p>
          </div>
        </Card>
      </div>

      {/* Bottom Section: Absences and Document Review Summaries */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Absence Notification Summaries"
          action={
            <Link to="/admin/reports" className="text-sm font-medium text-teal hover:underline">
              Reports
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xl font-bold text-warn-fg">{absences.pending}</div>
              <div className="text-xs text-muted mt-0.5">Pending Review</div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xl font-bold text-bad-fg">{absences.needsFollowUp}</div>
              <div className="text-xs text-muted mt-0.5">Needs Follow-Up</div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xl font-bold text-info-fg">{absences.acknowledged}</div>
              <div className="text-xs text-muted mt-0.5">Acknowledged</div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xl font-bold text-ok-fg">{absences.reviewed}</div>
              <div className="text-xs text-muted mt-0.5">Reviewed & Closed</div>
            </div>
          </div>
        </Card>

        <Card title="Document Submissions Audit">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Files className="h-4 w-4 text-teal" />
                <span className="font-medium">Total Attached Documents:</span>
              </div>
              <span className="font-bold font-mono">{docs.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Online Student Uploads (PDF/PNG/JPEG):</span>
              <span className="font-mono">{docs.online}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Manual Staff Receipts (Email / In-Person):</span>
              <span className="font-mono">{docs.manual}</span>
            </div>
            <div className="border-t border-line pt-2 text-xs text-muted">
              All documents are stored in private storage with SHA-256 integrity verification and require role-based authorization for download.
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
