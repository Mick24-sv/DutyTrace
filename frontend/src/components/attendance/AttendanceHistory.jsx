import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CircleAlert, Clock, ShieldQuestion } from 'lucide-react';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import SessionBadge from './SessionBadge.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDateKey, formatDuration, formatHours, formatTime } from '../../utils/format.js';
import { apiGet } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { findEligibleDiscrepancy } from '../../utils/discrepancyNavigation.js';

const FLAG_TEXT = { crosses_midnight: 'crosses midnight' };

const EXPLAIN = {
  missing_time_out: 'No time-out was recorded, so these hours are not counted.',
  orphan_time_out: 'A time-out with no time-in before it, so these hours are not counted.',
  needs_review: 'Longer than the allowed session length, so these hours are not counted until reviewed.',
};

// Daily and monthly attendance for one person. `endpoint` is e.g. '/attendance/me'
// or `/attendance/users/<id>`; the API decides whether the viewer may see it.
export default function AttendanceHistory({ endpoint }) {
  const [month, setMonth] = useState(''); // '' = let the server pick the current month
  const [correctionState, setCorrectionState] = useState({ busyDate: '', message: '' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useApiData(`${endpoint}${month ? `?month=${month}` : ''}`);
  const tz = data?.timezone;

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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-auto">
          {data?.user && (
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">{data.user.fullName}</span>
              {data.user.office ? ` · ${data.user.office.name}` : ''}
            </p>
          )}
        </div>
        <div className="w-full sm:w-auto">
          <label htmlFor="month" className="mb-1 block text-xs font-medium text-muted">Month</label>
          <input
            id="month" type="month" value={month || data?.month || ''}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:w-auto"
          />
        </div>
      </div>

      {loading && <p role="status" className="text-sm text-muted">Loading attendance…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {correctionState.message && <p role="status" className="mb-4 rounded-lg bg-info-bg px-3 py-2 text-sm text-info-fg">{correctionState.message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard compact label="Recorded hours" value={formatHours(data.totals.recordedHours)} hint="From completed sessions" icon={Clock} />
            <StatCard compact label="Completed sessions" value={data.totals.countedSessions} icon={CalendarCheck} />
            <StatCard
              compact
              label="Need attention" value={data.totals.incompleteCount}
              hint={data.totals.inProgress ? 'Plus one in progress' : 'Incomplete or flagged'}
              icon={CircleAlert}
            />
            <StatCard
              compact
              label="Verified hours" value={formatHours(data.totals.verifiedHours)}
              hint={data.totals.verificationAvailable ? 'From the approved DTR for this month' : 'No approved DTR for this month yet'}
              icon={ShieldQuestion}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Recorded hours come from time-in/time-out scans and are <strong>not verified</strong> until a supervisor approves the month's DTR.
            Incomplete sessions are shown below but never counted. Times are shown in {tz}.
          </p>

          {data.days.length === 0 ? (
            <div className="mt-6">
              <EmptyState icon={Clock} title="No attendance this month">
                Nothing has been recorded for {data.month}.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {[...data.days].reverse().map((day) => (
                <Card
                  key={day.date}
                  title={formatDateKey(day.date)}
                  action={<span className="text-sm font-medium text-navy">{formatHours(day.recordedHours)} recorded</span>}
                >
                  <div className="space-y-2 sm:hidden">
                    {day.sessions.map((s) => (
                      <article key={s.id} className="rounded-lg border border-line bg-surface p-3">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                          <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Time in</dt><dd className="mt-0.5 break-words text-sm text-ink">{formatTime(s.timeIn, tz)}</dd></div>
                          <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Time out</dt><dd className="mt-0.5 break-words text-sm text-ink">{formatTime(s.timeOut, tz)}</dd></div>
                          <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Duration</dt><dd className="mt-0.5 break-words text-sm text-ink">{s.counted ? formatDuration(s.seconds) : s.seconds != null ? `${formatDuration(s.seconds)} (not counted)` : '—'}</dd></div>
                          <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Status</dt><dd className="mt-1"><SessionBadge status={s.status} /></dd></div>
                        </dl>
                        {(s.flags.length > 0 || EXPLAIN[s.status]) && <p className="mt-2 text-xs leading-5 text-muted">{s.flags.map((flag) => FLAG_TEXT[flag] ?? flag).join(' · ')}{s.flags.length > 0 && EXPLAIN[s.status] ? ' · ' : ''}{s.status === 'needs_review' ? `Longer than ${data.maxSessionHours} h, so it is not counted until reviewed.` : EXPLAIN[s.status]}</p>}
                        {user?.role === 'student' && <button type="button" disabled={correctionState.busyDate === day.date} onClick={() => checkCorrection(day.date, s.id)} className="mt-3 min-h-10 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-teal hover:bg-canvas disabled:opacity-50">{correctionState.busyDate === day.date ? 'Checking…' : 'Request correction'}</button>}
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <caption className="sr-only">Attendance sessions on {day.date}</caption>
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-muted">
                          <th scope="col" className="px-2 py-2 font-medium">Time in</th>
                          <th scope="col" className="px-2 py-2 font-medium">Time out</th>
                          <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                          <th scope="col" className="px-2 py-2 font-medium">Status</th>
                          {user?.role === 'student' && <th scope="col" className="px-2 py-2 font-medium">Correction</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {day.sessions.map((s) => (
                          <tr key={s.id} className="border-t border-line align-top">
                            <td className="px-2 py-2.5">{formatTime(s.timeIn, tz)}</td>
                            <td className="px-2 py-2.5">{formatTime(s.timeOut, tz)}</td>
                            <td className="px-2 py-2.5">
                              {s.counted ? formatDuration(s.seconds) : s.seconds != null ? `${formatDuration(s.seconds)} (not counted)` : '—'}
                            </td>
                            <td className="px-2 py-2.5">
                              <SessionBadge status={s.status} />
                              {s.flags.map((f) => (
                                <span key={f} className="ml-2 text-xs text-muted">{FLAG_TEXT[f] ?? f}</span>
                              ))}
                              {EXPLAIN[s.status] && (
                                <p className="mt-1 max-w-xs text-xs text-muted">
                                  {s.status === 'needs_review' ? `Longer than ${data.maxSessionHours} h, so it is not counted until reviewed.` : EXPLAIN[s.status]}
                                </p>
                              )}
                            </td>
                            {user?.role === 'student' && <td className="px-2 py-2.5"><button type="button" disabled={correctionState.busyDate === day.date} onClick={() => checkCorrection(day.date, s.id)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-teal hover:bg-canvas disabled:opacity-50">{correctionState.busyDate === day.date ? 'Checking…' : 'Request correction'}</button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
