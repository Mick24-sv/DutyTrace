import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import EmptyState from '../ui/EmptyState.jsx';
import SessionBadge from './SessionBadge.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDateKey, formatDuration, formatHours, formatTime } from '../../utils/format.js';
import { apiGet } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { findEligibleDiscrepancy } from '../../utils/discrepancyNavigation.js';

const FLAG_TEXT = { crosses_midnight: 'crosses midnight' };
const DAYS_PER_PAGE = 7;

const EXPLAIN = {
  missing_time_out: 'No time-out was recorded, so these hours are not counted.',
  orphan_time_out: 'A time-out with no time-in before it, so these hours are not counted.',
  needs_review: 'Longer than the allowed session length, so these hours are not counted until reviewed.',
};

// Daily and monthly attendance for one person. `endpoint` is e.g. '/attendance/me'
// or `/attendance/users/<id>`; the API decides whether the viewer may see it.
export default function AttendanceHistory({ endpoint }) {
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(''); // '' = let the server pick the current month
  const [correctionState, setCorrectionState] = useState({ busyDate: '', message: '' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useApiData(`${endpoint}${month ? `?month=${month}` : ''}`);
  const tz = data?.timezone;
  useEffect(() => { setPage(1); }, [endpoint]);

  const checkCorrection = async (date, sessionId = null) => {
    setCorrectionState({ busyDate: date, message: '' });
    try {
      const result = await apiGet(`/attendance-discrepancies?date=${encodeURIComponent(date)}&limit=200`);
      const { item, ambiguous } = findEligibleDiscrepancy(result.items, sessionId);
      if (item) {
        navigate(`/student/discrepancies?date=${encodeURIComponent(date)}&discrepancyId=${encodeURIComponent(item.id)}`);
        return;
      }
      if (ambiguous) {
        navigate(`/student/discrepancies?date=${encodeURIComponent(date)}`);
        return;
      }
      setCorrectionState({ busyDate: '', message: 'No open correction request is available for this date. Requests can be made when an approved duty shift has a detected attendance discrepancy.' });
    } catch (err) {
      setCorrectionState({ busyDate: '', message: err.message });
    }
  };

  const days = [...(data?.days ?? [])].reverse();
  const pageCount = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * DAYS_PER_PAGE;
  const visibleDays = days.slice(pageStart, pageStart + DAYS_PER_PAGE);
  const sessionDuration = (session) => session.seconds == null ? '—'
    : session.seconds < 60 && session.counted ? '< 1 m' : formatDuration(session.seconds);
  const correctionButton = (day, session) => user?.role === 'student' && (
    <button type="button" disabled={correctionState.busyDate === day.date}
      onClick={() => checkCorrection(day.date, session.id)}
      aria-label={`Request correction for ${formatDateKey(day.date)}, clock-in ${formatTime(session.timeIn, tz)}`}
      className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50">
      {correctionState.busyDate === day.date ? 'Checking…' : 'Request correction'}
    </button>
  );
  const sessionNote = (session) => [
    ...(session.flags ?? []).map((flag) => FLAG_TEXT[flag] ?? flag),
    session.status === 'needs_review' ? `Longer than ${data.maxSessionHours} h; not counted until reviewed.` : EXPLAIN[session.status],
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-navy">Attendance log</h2>
          {data?.user && <p className="mt-1 text-xs text-muted">{data.user.fullName}{data.user.office ? ` · ${data.user.office.name}` : ''}</p>}
          <p className="mt-1 text-xs text-muted">{tz ? `Times in ${tz}. ` : ''}Expand a day to see scans and corrections.</p>
        </div>
        <label className="text-xs text-muted" htmlFor="attendance-month">Month
          <input id="attendance-month" type="month" value={month || data?.month || ''}
            onChange={(event) => { if(event.target.value) { setMonth(event.target.value); setPage(1); } }}
            className="mt-1 block h-10 max-w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal" />
        </label>
      </div>
      {loading && <p role="status" className="text-sm text-muted">Loading attendance…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
      {correctionState.message && <p role="status" className="rounded-lg bg-info-bg p-3 text-sm text-info-fg">{correctionState.message}</p>}
      {data && <>
        <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-4">
          {[
            ['Recorded', formatHours(data.totals.recordedHours)],
            ['Verified', data.totals.verificationAvailable ? formatHours(data.totals.verifiedHours) : 'Pending DTR'],
            ['Completed', data.totals.countedSessions],
            ['Need attention', data.totals.incompleteCount],
          ].map(([label, value]) => <div key={label} className="min-w-0 px-4 py-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-base font-semibold text-navy">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted">Recorded hours become verified after DTR approval. Incomplete or flagged sessions are not counted.</p>
        {days.length === 0 ? <EmptyState icon={Clock} title="No attendance this month">Nothing has been recorded for {data.month}.</EmptyState> :
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {visibleDays.map((day) => {
              const attention = day.sessions.filter((session) => !['complete', 'in_progress'].includes(session.status)).length;
              const inProgress = day.sessions.some((session) => session.status === 'in_progress');
              return <details key={`${data.month}-${currentPage}-${day.date}`} className="group border-b border-line last:border-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal sm:px-4 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{formatDateKey(day.date)}</span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                      <span>{day.sessions.length} {day.sessions.length === 1 ? 'session' : 'sessions'}</span>
                      {inProgress && <span className="font-medium text-teal">Timed in</span>}
                      {attention > 0 && <span className="font-medium text-bad-fg">{attention} need attention</span>}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">{formatHours(day.recordedHours)}</span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line bg-canvas/40 px-3 sm:px-4">
                  <div className="divide-y divide-line md:hidden">
                    {day.sessions.map((session) => <article key={session.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><SessionBadge status={session.status} /><span className="text-xs font-medium tabular-nums text-ink">{sessionDuration(session)}{!session.counted && session.seconds != null ? ' · not counted' : ''}</span></div>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-[11px] text-muted">Time in</dt><dd className="mt-0.5 tabular-nums text-ink">{formatTime(session.timeIn, tz)}</dd></div>
                        <div><dt className="text-[11px] text-muted">Time out</dt><dd className="mt-0.5 tabular-nums text-ink">{formatTime(session.timeOut, tz)}</dd></div>
                      </dl>
                      {sessionNote(session) && <p className="mt-2 text-xs text-muted">{sessionNote(session)}</p>}
                      {correctionButton(day, session)}
                    </article>)}
                  </div>
                  <table className="hidden w-full text-left text-sm md:table">
                    <caption className="sr-only">Attendance sessions on {day.date}, times in {tz}</caption>
                    <thead><tr className="text-[11px] text-muted">{['Time in', 'Time out', 'Duration', 'Status', ...(user?.role === 'student' ? [''] : [])].map((label, i) => <th scope="col" key={i} className="py-2 pr-3 font-medium">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
                    <tbody>{day.sessions.map((session) => <tr key={session.id} className="border-t border-line align-top">
                      <td className="py-3 pr-3 tabular-nums">{formatTime(session.timeIn, tz)}</td>
                      <td className="py-3 pr-3 tabular-nums">{formatTime(session.timeOut, tz)}</td>
                      <td className="py-3 pr-3">{sessionDuration(session)}{!session.counted && session.seconds != null && <span className="block text-xs text-muted">Not counted</span>}</td>
                      <td className="py-3 pr-3"><SessionBadge status={session.status} />{sessionNote(session) && <p className="mt-1 max-w-48 text-xs text-muted">{sessionNote(session)}</p>}</td>
                      {user?.role === 'student' && <td className="py-1.5 text-right">{correctionButton(day, session)}</td>}
                    </tr>)}</tbody>
                  </table>
                </div>
              </details>;
            })}
            <nav aria-label="Attendance days pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-3 sm:px-4">
              <p role="status" className="w-full text-center text-xs text-muted sm:w-auto sm:text-left">
                Days {pageStart + 1}–{pageStart + visibleDays.length} of {days.length}
                <span className="ml-2">Page {currentPage} of {pageCount}</span>
              </p>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
                <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40">
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </nav>
          </div>}
      </>}
    </div>
  );
}
