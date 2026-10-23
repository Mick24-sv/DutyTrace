import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, Clock3, ShieldCheck } from 'lucide-react';
import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDateKey, formatHours, formatMonth } from '../../utils/format.js';

const DTR_STATUS = {
  approved: ['Approved', 'approved'],
  submitted: ['Submitted', 'info'],
  under_review: ['Under review', 'pending'],
  needs_correction: ['Needs correction', 'rejected'],
  draft: ['Draft', 'neutral'],
  not_submitted: ['Not submitted', 'neutral'],
};

function Hours({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-canvas p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value == null ? '—' : formatHours(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function MonthlyDutySummary() {
  const navigate = useNavigate();
  const termsQuery = useApiData('/semesters/mine');
  const terms = termsQuery.data?.terms ?? [];
  const [termId, setTermId] = useState('');
  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    if (!terms.length) return;
    if (!terms.some((term) => term.id === termId)) {
      setTermId((terms.find((term) => term.isCurrent) ?? terms[0]).id);
    }
  }, [termId, terms]);

  const summaryQuery = useApiData(termId ? `/semesters/mine/${termId}/monthly-summary` : null);
  const term = terms.find((item) => item.id === termId);
  const progress = summaryQuery.data?.months ? term : null;
  const months = summaryQuery.data?.months ?? [];
  const selectedMonth = months[monthIndex] ?? months[months.length - 1];

  useEffect(() => {
    const currentMonthIndex = months.findIndex((month) => month.isOngoing);
    setMonthIndex(currentMonthIndex >= 0 ? currentMonthIndex : Math.max(0, months.length - 1));
  }, [termId, summaryQuery.data]);

  return (
    <Card title="Monthly duty hours" className="mb-6">
      {termsQuery.loading && <p className="text-sm text-muted">Loading academic terms…</p>}
      {termsQuery.error && <p role="alert" className="text-sm text-bad-fg">{termsQuery.error}</p>}
      {!termsQuery.loading && !termsQuery.error && terms.length === 0 && (
        <p className="text-sm text-muted">No academic term is available yet. Ask your administrator to configure the term and assign your duty-hour requirement.</p>
      )}

      {terms.length > 0 && (
        <>
          <label className="mb-4 block text-xs font-medium text-muted">
            Academic year and semester
            <select value={termId} onChange={(event) => setTermId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink sm:max-w-sm">
              {terms.map((item) => <option key={item.id} value={item.id}>{item.academicYear} · {item.semester} semester{item.isCurrent ? ' · Current' : ''}</option>)}
            </select>
          </label>

          {progress && (
            <div className="mb-5 rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><CalendarRange className="h-4 w-4 text-teal"/>{progress.academicYear} · {progress.semester} semester</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Hours label="Required duty hours" value={progress.requiredHours} hint={progress.requirementAssigned ? 'Assigned for this term' : 'No requirement assigned'} />
                <Hours label="Verified this semester" value={progress.verifiedHours ?? 0} hint="Approved DTRs and historical credits" />
                <Hours label="Remaining hours" value={progress.remainingHours} hint={progress.requirementAssigned ? 'Based on verified hours' : 'Unavailable until a requirement is assigned'} />
              </div>
              {progress.requirementAssigned && <div className="mt-3"><ProgressBar value={progress.verifiedHours ?? 0} max={progress.requiredHours} label="Semester completion"/></div>}
            </div>
          )}

          {summaryQuery.loading && <p role="status" className="text-sm text-muted">Loading monthly totals…</p>}
          {summaryQuery.error && <p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{summaryQuery.error}</p>}
          {!summaryQuery.loading && !summaryQuery.error && summaryQuery.data?.months?.length === 0 && (
            <p className="text-sm text-muted">This term has not started yet.</p>
          )}
          {!!months.length && selectedMonth && (
            <div className="rounded-xl border border-line p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <button type="button" disabled={monthIndex <= 0} onClick={() => setMonthIndex((index) => Math.max(0, index - 1))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span className="text-xs text-muted">{monthIndex + 1} of {months.length}</span>
                <button type="button" disabled={monthIndex >= months.length - 1} onClick={() => setMonthIndex((index) => Math.min(months.length - 1, index + 1))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
              {(() => {
                const month = selectedMonth;
                const [status, tone] = DTR_STATUS[month.dtrStatus] ?? ['Not submitted', 'neutral'];
                return (
                  <article key={month.month}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink">{formatMonth(month.month)}</h3>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={month.isOngoing ? 'info' : tone}>{month.isOngoing ? 'Ongoing' : status}</Badge>
                        {month.pendingCorrectionCount > 0 && <Badge tone="pending">{month.pendingCorrectionCount} correction{month.pendingCorrectionCount === 1 ? '' : 's'} pending</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                      <Hours label="Recorded" value={month.recordedHours} hint="Calculated from attendance" />
                      <Hours label="Verified" value={month.verifiedHours ?? 0} hint={month.verifiedHours == null ? 'Not approved yet' : 'Approved DTR hours'} />
                      <Hours label="Historical verified" value={month.historicalHours ?? 0} hint="Paper DTR or official reference" />
                      <Hours label="Pending verification" value={month.pendingHours} hint="Recorded, not yet verified" />
                      <Hours label="From approved corrections" value={month.adjustedHours} hint="Included in recorded hours" />
                    </div>
                    {month.discrepancies?.length > 0 && <div className="mt-4 border-t border-line pt-3">
                      <h4 className="mb-2 text-sm font-medium text-ink">Attendance correction requests</h4>
                      <ul className="space-y-2">
                        {month.discrepancies.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-muted">{formatDateKey(item.date)} · {item.type.replaceAll('_', ' ')}</span>
                          <button type="button" onClick={() => navigate(`/student/discrepancies?date=${encodeURIComponent(item.date)}&discrepancyId=${encodeURIComponent(item.id)}`)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-teal hover:bg-canvas">
                            {item.status === 'open' ? 'Request correction' : item.status === 'rejected' || item.status === 'resolved' || item.status === 'approved_correction' ? 'View decision' : 'View request'}
                          </button>
                        </li>)}
                      </ul>
                    </div>}
                  </article>
                );
              })()}
            </div>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs text-muted"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><span>Pending verification is calculated from recorded hours minus verified hours. Proposed corrections are not counted. Approved correction hours are shown separately and remain part of the recorded total.</span><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/></p>
        </>
      )}
    </Card>
  );
}
