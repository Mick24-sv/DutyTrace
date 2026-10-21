import { useState } from 'react';
import { CalendarCheck, CircleAlert, Clock, ShieldQuestion } from 'lucide-react';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import SessionBadge from './SessionBadge.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDateKey, formatDuration, formatHours, formatTime } from '../../utils/format.js';

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
  const { data, loading, error } = useApiData(`${endpoint}${month ? `?month=${month}` : ''}`);
  const tz = data?.timezone;

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
        <div>
          <label htmlFor="month" className="mb-1 block text-xs font-medium text-muted">Month</label>
          <input
            id="month" type="month" value={month || data?.month || ''}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:w-auto"
          />
        </div>
      </div>

      {loading && <p role="status" className="text-sm text-muted">Loading attendance…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Recorded hours" value={formatHours(data.totals.recordedHours)} hint="From completed sessions" icon={Clock} />
            <StatCard label="Completed sessions" value={data.totals.countedSessions} icon={CalendarCheck} />
            <StatCard
              label="Need attention" value={data.totals.incompleteCount}
              hint={data.totals.inProgress ? 'Plus one in progress' : 'Incomplete or flagged'}
              icon={CircleAlert}
            />
            <StatCard
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
                  <div className="-m-2 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Attendance sessions on {day.date}</caption>
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-muted">
                          <th scope="col" className="px-2 py-2 font-medium">Time in</th>
                          <th scope="col" className="px-2 py-2 font-medium">Time out</th>
                          <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                          <th scope="col" className="px-2 py-2 font-medium">Status</th>
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
