import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Hourglass,
  QrCode,
  Timer,
  AlertCircle,
  FileText,
  CalendarOff,
  FolderCheck,
  TrendingUp,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import SessionBadge from '../../components/attendance/SessionBadge.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDuration, formatHours, formatMonth, formatTime } from '../../utils/format.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const status = useApiData('/attendance/status');
  const month = useApiData('/attendance/me');
  const dtrs = useApiData('/dtrs/mine');
  const absences = useApiData('/absences/summary');
  const cases = useApiData('/cases/summary');

  const tz = status.data?.timezone;
  const timedIn = status.data?.state === 'timed_in';
  const totals = month.data?.totals;
  const required = dtrs.data?.policy?.requiredMonthlyHours ?? 40;
  const recorded = totals?.recordedHours ?? 0;
  const verifiedTotal = dtrs.data?.verifiedHoursTotal ?? 0;
  const remaining = Math.max(0, Math.round((required - recorded) * 100) / 100);
  const progressPercent = required > 0 ? Math.min(100, Math.round((recorded / required) * 100)) : 0;

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

  const anyLoading = status.loading || month.loading || dtrs.loading;
  const anyError = status.error || month.error || dtrs.error;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.fullName || 'Student Assistant'}`}
        description={
          user?.office
            ? `Assigned to ${user.office.name}. Here is your current attendance, duty-hour progress, and monthly status.`
            : 'No office assigned yet. Contact your supervisor or administrator.'
        }
      >
        <Link
          to="/student/scan"
          className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal/90 transition"
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's status"
          value={status.loading ? '…' : timedIn ? 'Timed in' : 'Not timed in'}
          hint={
            timedIn
              ? `Timed in since ${formatTime(status.data?.since, tz)}`
              : 'Scan your office QR code to start duty'
          }
          icon={Timer}
        />
        <StatCard
          label="Recorded this month"
          value={totals ? formatHours(recorded) : anyLoading ? '…' : '0.00 h'}
          hint="Unverified until DTR approval"
          icon={Hourglass}
        />
        <StatCard
          label="Verified hours"
          value={dtrs.data ? formatHours(verifiedTotal) : anyLoading ? '…' : '0.00 h'}
          hint={
            dtrs.data
              ? `From ${dtrs.data.approvedCount || 0} approved DTR(s)`
              : 'Official verified duty time'
          }
          icon={CheckCircle2}
        />
        <StatCard
          label="Remaining this month"
          value={totals ? formatHours(remaining) : anyLoading ? '…' : formatHours(required)}
          hint={`Target: ${formatHours(required)} monthly required`}
          icon={CalendarClock}
        />
      </div>

      {/* Monthly Duty-Hour Progress Card */}
      <Card className="mt-6" title="Monthly duty-hour progress">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal" />
              <span className="font-medium text-ink">
                {formatHours(recorded)} recorded of {formatHours(required)} required
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={progressPercent >= 100 ? 'approved' : progressPercent >= 50 ? 'info' : 'pending'}>
                {progressPercent}% Complete
              </Badge>
              {remaining > 0 ? (
                <span className="text-muted text-xs font-medium">({formatHours(remaining)} remaining)</span>
              ) : (
                <span className="text-ok-fg text-xs font-semibold">Requirement met!</span>
              )}
            </div>
          </div>
          <ProgressBar value={recorded} max={required} label="Duty hours progress" />
          <p className="text-xs text-muted">
            Progress is calculated from complete attendance sessions recorded this month. Approval of your monthly DTR converts recorded hours into officially verified hours.
          </p>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
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
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{s.date}</span>
                    <span className="text-muted text-xs">
                      ({formatTime(s.timeIn, tz)} – {formatTime(s.timeOut, tz)})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted font-mono">
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
        <div className="space-y-6">
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

          <Card title="Notices & Compliance">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-canvas transition">
                <div className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-muted" />
                  <Link to="/student/absences" className="font-medium text-ink hover:text-teal">
                    Absence notices
                  </Link>
                </div>
                <div>
                  {absences.loading ? (
                    <span className="text-muted text-xs">…</span>
                  ) : absences.data?.needsFollowUp > 0 ? (
                    <Badge tone="rejected">{absences.data.needsFollowUp} action needed</Badge>
                  ) : (
                    <span className="text-xs text-muted font-medium">
                      {(absences.data?.pending || 0) + (absences.data?.acknowledged || 0)} active
                    </span>
                  )}
                </div>
              </li>
              <li className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-canvas transition">
                <div className="flex items-center gap-2">
                  <FolderCheck className="h-4 w-4 text-muted" />
                  <Link to="/student/cases" className="font-medium text-ink hover:text-teal">
                    Compliance cases
                  </Link>
                </div>
                <div>
                  {cases.loading ? (
                    <span className="text-muted text-xs">…</span>
                  ) : cases.data?.needsCorrection > 0 ? (
                    <Badge tone="rejected">{cases.data.needsCorrection} needs correction</Badge>
                  ) : (
                    <span className="text-xs text-muted font-medium">
                      {(cases.data?.open || 0) +
                        (cases.data?.documentsPending || 0) +
                        (cases.data?.underReview || 0)}{' '}
                      active
                    </span>
                  )}
                </div>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
