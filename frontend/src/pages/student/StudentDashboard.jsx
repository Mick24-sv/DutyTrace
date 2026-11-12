import OfficeTeammates from '../../components/dashboard/OfficeTeammates.jsx';
import StudentSemesterProgress from '../../components/dashboard/StudentSemesterProgress.jsx';
import {LayoutDashboard as UIActionLayoutDashboard} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange,
  CheckCircle2,
  QrCode,
  Timer,
  AlertCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import SessionBadge from '../../components/attendance/SessionBadge.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDuration, formatHours, formatMonth, formatTime } from '../../utils/format.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [selectedTermId, setSelectedTermId] = useState('');
  const status = useApiData('/attendance/status');
  const month = useApiData('/attendance/me');
  const dtrs = useApiData('/dtrs/mine');
  const semesterTerms = useApiData('/semesters/mine');
  const discrepancySummary = useApiData('/attendance-discrepancies/summary');

  const terms = semesterTerms.data?.terms ?? [];
  const currentTerm = terms.find((term) => term.isCurrent);
  useEffect(() => {
    if (!selectedTermId && terms.length > 0) setSelectedTermId((currentTerm ?? terms[0]).id);
  }, [currentTerm, selectedTermId, terms]);
  const selectedTerm = terms.find((term) => term.id === selectedTermId) ?? null;
  const tz = status.data?.timezone;
  const timedIn = status.data?.state === 'timed_in';
  const verifiedSemesterHours = selectedTerm?.verifiedHours ?? 0;
  const requiredSemesterHours = selectedTerm?.requiredHours;
  const remainingSemesterHours = selectedTerm?.remainingHours;

  const recent = month.data
    ? [...month.data.days]
        .reverse()
        .flatMap((d) => d.sessions.slice().reverse())
        .slice(0, 5)
    : [];

  const incompleteSessions = month.data
    ? month.data.days
        .flatMap((d) => d.sessions)
        .filter((s) => !s.counted && s.status !== 'in_progress')
    : [];

  const lastMonth = dtrs.data?.months?.[0];
  const anyError = status.error || month.error || dtrs.error || semesterTerms.error;

  return (
    <>
      <PageHeader icon={UIActionLayoutDashboard}
        title={`Welcome, ${user?.fullName || 'Student Assistant'}`}
        description={
          user?.office
            ? `Assigned to ${user.office.name}. Here is your attendance, semester duty-hour progress, and monthly DTR status.`
            : 'No office assigned yet. Contact your supervisor or administrator.'
        }
      >
        <Link
          to="/student/scan"
          data-tutorial="scan-qr"
          className="inline-flex min-h-11 w-fit max-w-full self-start items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal/90"
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Scan QR to {timedIn ? 'time out' : 'time in'}
        </Link>
      </PageHeader>

      {anyError && (
        <div role="alert" className="mb-6 rounded-lg bg-bad-bg p-4 text-sm text-bad-fg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load all dashboard data</p>
            <p className="mt-1">{anyError}</p>
          </div>
        </div>
      )}


      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <StatCard
          compact
          mobileInline
          hideHintOnMobile
          className="col-span-2 sm:col-span-1"
          label="Today"
          value={status.loading ? '…' : timedIn ? 'Timed in' : 'Not timed in'}
          hint={
            timedIn
              ? `Timed in since ${formatTime(status.data?.since, tz)}`
              : 'Scan your office QR code to start duty'
          }
          icon={Timer}
        />
        <StatCard
          compact
          label="Approved hours"
          hideHintOnMobile
          value={selectedTerm ? formatHours(verifiedSemesterHours) : semesterTerms.loading ? '…' : '—'}
          hint={
            selectedTerm
              ? 'Approved DTR sessions within this semester'
              : 'Hours approved by your supervisor'
          }
          icon={CheckCircle2}
        />
        <StatCard
          compact
          hideHintOnMobile
          label={<><span className="sm:hidden">Remaining hours</span><span className="hidden sm:inline">Remaining semester hours</span></>}
          value={
            !selectedTerm && semesterTerms.loading
              ? '…'
              : !selectedTerm || !selectedTerm.requirementAssigned
                ? 'Not assigned'
                : formatHours(remainingSemesterHours)
          }
          hint={
            selectedTerm?.requirementAssigned
              ? `${formatHours(requiredSemesterHours)} assigned for this semester`
              : selectedTerm
                ? 'Contact your administrator if a requirement is expected.'
                : 'No active academic term configured'
          }
          icon={CalendarRange}
        />
      </div>

      {(discrepancySummary.data?.open ?? 0) > 0 && <Link to="/student/discrepancies" className="mt-5 flex min-w-0 items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3 shadow-card transition hover:border-teal/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:flex-row sm:items-center sm:p-4">
        <span className="min-w-0"><b className="block text-sm text-ink">Attendance corrections</b><span className="mt-1 block text-xs leading-relaxed text-muted sm:text-sm">Review flagged records, submit explanations, and track supervisor decisions.</span></span>
        <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-warn-bg px-2.5 py-1 text-xs font-medium text-warn-fg sm:px-3 sm:text-sm">{discrepancySummary.loading?'…':`${discrepancySummary.data?.open??0} unresolved`}</span>
      </Link>}

      <StudentSemesterProgress terms={terms} selectedTerm={selectedTerm} selectedTermId={selectedTermId} onSelect={setSelectedTermId} loading={semesterTerms.loading} error={semesterTerms.error} />

      <OfficeTeammates preview />
      <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Recent Sessions & Incomplete Alerts */}
        <Card
          title="Recent attendance sessions"
          className="lg:col-span-2"
          action={
            <Link to="/student/attendance" className="text-sm font-medium text-teal hover:underline">
              View all
            </Link>
          }
        >
          {month.loading && <p role="status" className="text-sm text-muted">Loading attendance…</p>}

          {month.data && recent.length === 0 && (
            <p className="text-sm text-muted py-4 text-center">No attendance sessions recorded this month yet.</p>
          )}

          {recent.length > 0 && (
            <ul className="divide-y divide-line">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-ink">{s.date}</span>
                      <span className="mt-0.5 block break-words text-xs text-muted">{formatTime(s.timeIn, tz)} – {formatTime(s.timeOut, tz)}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-xs text-muted sm:text-sm">
                        {s.counted ? formatDuration(s.seconds) : '—'}
                      </span>
                      <SessionBadge status={s.status} />
                    </div>
                </li>
              ))}
            </ul>
          )}

          {incompleteSessions.length > 0 && (
            <div role="note" className="mt-4 rounded-lg bg-warn-bg p-3 text-xs text-warn-fg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  {incompleteSessions.length} incomplete session{incompleteSessions.length > 1 ? 's' : ''} detected:
                </span>{' '}
                These sessions are missing a time-out or require supervisor review and are currently not counted toward your duty hours. Visit{' '}
                <Link to="/student/attendance" className="underline font-medium hover:text-navy">
                  My Attendance
                </Link>{' '}
                to review them.
              </div>
            </div>
          )}
        </Card>

        {/* Right column: DTR, Absences, Compliance */}
        <div className="space-y-4 lg:space-y-6">
          <Card
            title="Monthly DTR status"
            action={
              <Link to="/student/dtr" className="text-sm font-medium text-teal hover:underline">
                Manage
              </Link>
            }
          >
            {dtrs.loading && <p role="status" className="text-sm text-muted">Loading DTR status…</p>}
            {lastMonth ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{formatMonth(lastMonth.month)}</span>
                  {lastMonth.dtr ? (
                    <DtrStatusBadge status={lastMonth.dtr.status} />
                  ) : (
                    <Badge tone="info">Ready to generate</Badge>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {!lastMonth.dtr && 'Previous month has closed. Generate your DTR for supervisor submission.'}
                  {lastMonth.dtr?.status === 'draft' && 'Draft saved. Review your entries and submit to your supervisor.'}
                  {lastMonth.dtr?.status === 'submitted' && 'Submitted. Awaiting supervisor review.'}
                  {lastMonth.dtr?.status === 'under_review' && 'Currently being reviewed by your supervisor.'}
                  {lastMonth.dtr?.status === 'needs_correction' && 'Returned for correction. Check supervisor feedback and resubmit.'}
                  {lastMonth.dtr?.status === 'approved' && 'Approved and verified. Hours are officially recorded.'}
                </p>
              </div>
            ) : (
              !dtrs.loading && (
                <p className="text-sm text-muted">No closed months yet available for DTR generation.</p>
              )
            )}
          </Card>

        </div>
      </div>
    </>
  );
}
