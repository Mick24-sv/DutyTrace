import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange,
  CheckCircle2,
  Hourglass,
  QrCode,
  Timer,
  AlertCircle,
  FileText,
  CalendarOff,
  FolderCheck,
  TrendingUp,
  Compass,
  AlertTriangle,
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
import { formatDutyTime, formatDuration, formatHours, formatMonth, formatTime } from '../../utils/format.js';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [selectedTermId, setSelectedTermId] = useState('');
  const status = useApiData('/attendance/status');
  const month = useApiData('/attendance/me');
  const dtrs = useApiData('/dtrs/mine');
  const semesterTerms = useApiData('/semesters/mine');
  const dutySchedules = useApiData('/duty-schedules/mine');
  const absences = useApiData('/absences/summary');
  const cases = useApiData('/cases/summary');
  const forecast = useApiData(selectedTermId ? `/forecast/mine?termId=${selectedTermId}` : '/forecast/mine');

  const terms = semesterTerms.data?.terms ?? [];
  const currentTerm = terms.find((term) => term.isCurrent);
  useEffect(() => {
    if (!selectedTermId && terms.length > 0) setSelectedTermId((currentTerm ?? terms[0]).id);
  }, [currentTerm, selectedTermId, terms]);
  const selectedTerm = terms.find((term) => term.id === selectedTermId) ?? null;
  const tz = status.data?.timezone;
  const timedIn = status.data?.state === 'timed_in';
  const recordedSemesterHours = selectedTerm?.recordedHours ?? 0;
  const verifiedSemesterHours = selectedTerm?.verifiedHours ?? 0;
  const requiredSemesterHours = selectedTerm?.requiredHours;
  const remainingSemesterHours = selectedTerm?.remainingHours;
  const progressPercent = selectedTerm?.completionPercentage;

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
  const scheduleTerms = dutySchedules.data?.terms ?? [];
  const scheduleEntry = scheduleTerms.find((entry) => entry.term.isCurrent)
    ?? scheduleTerms.find((entry) => entry.term.id === selectedTermId)
    ?? scheduleTerms[0];
  const assignedSchedule = scheduleEntry?.approvedSchedule;

  const anyLoading = status.loading || month.loading || dtrs.loading || semesterTerms.loading || dutySchedules.loading;
  const anyError = status.error || month.error || dtrs.error || semesterTerms.error || dutySchedules.error;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.fullName || 'Student Assistant'}`}
        description={
          user?.office
            ? `Assigned to ${user.office.name}. Here is your attendance, semester duty-hour progress, and monthly DTR status.`
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
        <Link
          to="/student/schedule"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas transition"
        >
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
          My Duty Preferences
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
          label="Recorded hours"
          value={selectedTerm ? formatHours(recordedSemesterHours) : semesterTerms.loading ? '…' : '—'}
          hint={selectedTerm ? `${selectedTerm.academicYear} · ${selectedTerm.semester === 'first' ? '1st Semester' : selectedTerm.semester === 'second' ? '2nd Semester' : 'Summer Term'}` : 'Semester attendance hours'}
          icon={Hourglass}
        />
        <StatCard
          label="Verified hours"
          value={selectedTerm ? formatHours(verifiedSemesterHours) : semesterTerms.loading ? '…' : '—'}
          hint={
            selectedTerm
              ? 'Approved DTR sessions within this semester'
              : 'Only approved attendance counts as verified'
          }
          icon={CheckCircle2}
        />
        <StatCard
          label="Remaining semester hours"
          value={
            !selectedTerm && semesterTerms.loading
              ? '…'
              : !selectedTerm || !selectedTerm.requirementAssigned
                ? 'No duty-hour requirement assigned'
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

      <Card
        className="mt-6"
        title="Semester progress"
        action={terms.length > 0 && (
          <select
            aria-label="Academic term"
            value={selectedTermId}
            onChange={(event) => setSelectedTermId(event.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select academic term</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.academicYear} · {term.semester === 'first' ? '1st Semester' : term.semester === 'second' ? '2nd Semester' : 'Summer Term'}{term.isCurrent ? ' (Current)' : ''}
              </option>
            ))}
          </select>
        )}
      >
        {!selectedTerm && (
          <p className="text-sm text-muted">
            {semesterTerms.loading ? 'Loading academic term…' : 'No current term or assigned semester requirement is available. Monthly DTR targets do not set semester hours. Contact your administrator to configure the term and assign your requirement.'}
          </p>
        )}
        {selectedTerm && !selectedTerm.requirementAssigned && (
          <div className="space-y-2">
            <p className="font-medium text-ink">
              {selectedTerm.academicYear} · {selectedTerm.semester === 'first' ? '1st Semester' : selectedTerm.semester === 'second' ? '2nd Semester' : 'Summer Term'}
            </p>
            <p className="text-sm text-muted">No duty-hour requirement assigned</p>
            <p className="text-xs text-muted">Recorded hours are not treated as verified hours. Only approved DTR sessions count toward semester completion.</p>
          </div>
        )}
        {selectedTerm?.requirementAssigned && (
          <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal" />
              <span className="font-medium text-ink">
                {selectedTerm.academicYear} · {selectedTerm.semester === 'first' ? '1st Semester' : selectedTerm.semester === 'second' ? '2nd Semester' : 'Summer Term'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={progressPercent >= 100 ? 'approved' : progressPercent >= 50 ? 'info' : 'pending'}>
                {progressPercent}% Complete
              </Badge>
              {remainingSemesterHours > 0 ? (
                <span className="text-muted text-xs font-medium">({formatHours(remainingSemesterHours)} remaining)</span>
              ) : (
                <span className="text-ok-fg text-xs font-semibold">Requirement met!</span>
              )}
            </div>
          </div>
          <p className="text-sm text-ink">
            {formatHours(verifiedSemesterHours)} verified of {formatHours(requiredSemesterHours)} required
          </p>
          <ProgressBar value={verifiedSemesterHours} max={requiredSemesterHours} label="Semester duty-hour progress" />
          <p className="text-xs text-muted">
            {formatHours(recordedSemesterHours)} hours recorded during {selectedTerm.startsOn} to {selectedTerm.endsOn}. Only approved DTR sessions count toward completion.
          </p>
          {selectedTerm.completionDeadline && <p className="text-xs text-muted">Completion deadline: {selectedTerm.completionDeadline}</p>}
          </div>
        )}
      </Card>

      {/* Duty Completion Forecast Card */}
      <Card
        className="mt-5"
        title="Duty completion forecast"
        action={
          forecast.data?.status && (
            <Badge tone={forecast.data.statusTone || 'neutral'}>
              {forecast.data.statusLabel}
            </Badge>
          )
        }
      >
        {forecast.loading && (
          <p className="text-sm text-muted">Calculating completion forecast…</p>
        )}
        {forecast.error && (
          <p className="text-sm text-bad-fg">Unable to load forecast: {forecast.error}</p>
        )}
        {!forecast.loading && !forecast.error && forecast.data && (
          !forecast.data.status ? (
            <p className="text-sm text-muted">{forecast.data.message || 'No completion forecast available for this term.'}</p>
          ) : (
          <div className="space-y-4">
            {/* 4-stat forecast grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-line bg-canvas/60 p-3">
                <span className="text-xs text-muted block">Projected Completion</span>
                <span className="mt-1 text-base font-semibold text-ink block font-mono">
                  {forecast.data.isCompleted
                    ? 'Requirement Met'
                    : forecast.data.projectedCompletionDate || '—'}
                </span>
                <span className="text-[11px] text-muted">
                  {forecast.data.isCompleted
                    ? 'All required hours verified'
                    : forecast.data.estimatedWeeksRemaining != null
                    ? `~${forecast.data.estimatedWeeksRemaining} weeks remaining`
                    : 'Cannot project date'}
                </span>
              </div>

              <div className="rounded-lg border border-line bg-canvas/60 p-3">
                <span className="text-xs text-muted block">Actual Attendance Pace</span>
                <span className="mt-1 text-base font-semibold text-ink block font-mono">
                  {forecast.data.actualWeeklyPace > 0
                    ? `${forecast.data.actualWeeklyPace.toFixed(2)} h/wk`
                    : '0.00 h/wk'}
                </span>
                <span className="text-[11px] text-muted">
                  Over past {forecast.data.historicalPeriodWeeks || 4}-week period
                </span>
              </div>

              <div className="rounded-lg border border-line bg-canvas/60 p-3">
                <span className="text-xs text-muted block">Required Weekly Pace</span>
                <span className="mt-1 text-base font-semibold text-ink block font-mono">
                  {forecast.data.requiredWeeklyPace != null
                    ? `${forecast.data.requiredWeeklyPace.toFixed(2)} h/wk`
                    : '—'}
                </span>
                <span className="text-[11px] text-muted">
                  {forecast.data.deadline
                    ? `To meet deadline of ${forecast.data.deadline}`
                    : 'No deadline set'}
                </span>
              </div>

              <div className="rounded-lg border border-line bg-canvas/60 p-3">
                <span className="text-xs text-muted block">Confirmed Schedule</span>
                <span className="mt-1 text-base font-semibold text-ink block font-mono">
                  {forecast.data.hasConfirmedSchedule
                    ? `${forecast.data.confirmedWeeklyHours.toFixed(2)} h/wk`
                    : 'None'}
                </span>
                <span className="text-[11px] text-muted">
                  {forecast.data.hasConfirmedSchedule
                    ? `${forecast.data.confirmedFutureHours.toFixed(2)} h future shifts`
                    : 'No approved schedule'}
                </span>
              </div>
            </div>

            {/* Explanation / reason callout */}
            <div
              className={`rounded-lg p-3 text-sm flex items-start gap-2.5 ${
                forecast.data.status === 'completed' || forecast.data.status === 'on_track'
                  ? 'bg-ok-bg text-ok-fg'
                  : forecast.data.status === 'at_risk'
                  ? 'bg-bad-bg text-bad-fg'
                  : 'bg-warn-bg text-warn-fg'
              }`}
            >
              {forecast.data.status === 'completed' || forecast.data.status === 'on_track' ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : forecast.data.status === 'at_risk' ? (
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{forecast.data.statusLabel}</p>
                <p className="mt-0.5 text-xs opacity-95">{forecast.data.reason}</p>
              </div>
            </div>

            <p className="text-[11px] text-muted">
              Note: This forecast is calculated from verified attendance pace over recent active weeks and confirmed future shifts. It is distinct from schedule availability estimates.
            </p>
          </div>
        ))}
      </Card>

      <Card className="mt-5" title="Weekly duty schedule" action={<Link to="/student/schedule" className="text-sm font-medium text-teal hover:underline">Manage preferences</Link>}>
        {assignedSchedule ? <>
          <p className="mb-3 text-sm text-muted">Confirmed schedule · {assignedSchedule.effectiveStartsOn} to {assignedSchedule.effectiveEndsOn}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{assignedSchedule.days.map((day) => <div key={day.weekday} className="rounded-lg border border-line p-3 text-sm">
            <p className="font-medium">{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day.weekday - 1]}</p>
            <p className="mt-1 text-muted">{formatDutyTime(day.startsAt)}–{formatDutyTime(day.endsAt)}{day.afternoonStartsAt ? ` · ${formatDutyTime(day.afternoonStartsAt)}–${formatDutyTime(day.afternoonEndsAt)}` : ''}</p>
          </div>)}</div>
        </> : <p className="text-sm text-muted">{scheduleEntry?.proposal ? `Preference ${scheduleEntry.proposal.status.replaceAll('_', ' ')}. The supervisor has not confirmed your duty schedule yet.` : 'No confirmed duty schedule for this term. Submit your preferred duty days and times for supervisor review.'}</p>}
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
