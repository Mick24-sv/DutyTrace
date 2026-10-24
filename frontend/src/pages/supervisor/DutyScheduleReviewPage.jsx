import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatDutyTime } from '../../utils/format.js';

const PAGE_SIZE = 7;
const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';
const formatDutyPeriods = (day) => `Morning ${formatDutyTime(day.startsAt)}–${formatDutyTime(day.endsAt)}${day.afternoonStartsAt && day.afternoonEndsAt ? ` · afternoon ${formatDutyTime(day.afternoonStartsAt)}–${formatDutyTime(day.afternoonEndsAt)}` : ''}`;

export default function DutyScheduleReviewPage() {
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useApiData(`/duty-schedules/review?_=${tick}`);
  const [reasons, setReasons] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const schedules = data?.schedules ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(schedules.length / PAGE_SIZE)));
  const visibleSchedules = schedules.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => {
    if (!data?.schedules) return;
    setSuggestions((current) => Object.fromEntries(data.schedules.map((schedule) => [
      schedule.id,
      current[schedule.id] ?? schedule.days.map((day) => ({ ...day, startsAt: day.startsAt.slice(0, 5), endsAt: day.endsAt.slice(0, 5) })),
    ])));
  }, [data]);
  async function decide(schedule, decision) {
    setBusyId(schedule.id); setMessage(''); setActionError('');
    try {
      const body = { decision, reason: reasons[schedule.id] ?? '' };
      if (decision === 'request_changes') body.suggestedDays = suggestions[schedule.id] ?? [];
      await apiPost(`/duty-schedules/review/${schedule.id}/decision`, body);
      setMessage(`Schedule ${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned for revision'}.`); setTick((value) => value + 1);
    } catch (err) { setActionError(err.message); } finally { setBusyId(''); }
  }
  return <>
    <PageHeader title="Duty Schedule Review" description="Review requested duty times against verified hours and office staffing capacity. Approval confirms the recurring duty schedule; attendance continues to be recorded through the office QR workflow." />
    {loading && <p role="status" className="text-sm text-muted">Loading review queue…</p>}{error && <p role="alert" className="text-bad-fg">{error}</p>}{actionError && <p role="alert" className="mb-3 text-bad-fg">{actionError}</p>}{message && <p role="status" className="mb-3 text-teal">{message}</p>}
    {data?.schedules?.length > 0 && <Card className="mb-4" title="Weekly preference overview">
      <div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm"><thead><tr><th className="border border-line bg-canvas p-2">Student Assistant</th>{week.slice(0, 6).map((day) => <th key={day} className="border border-line bg-canvas p-2">{day.slice(0, 3)}</th>)}</tr></thead><tbody>{visibleSchedules.map((schedule) => <tr key={schedule.id}><th className="border border-line p-2 font-medium">{schedule.studentName}<span className="block text-xs font-normal text-muted">{schedule.status.replaceAll('_', ' ')}</span></th>{week.slice(0, 6).map((_, index) => { const day = schedule.days.find((entry) => entry.weekday === index + 1); return <td key={index} className="min-w-28 border border-line p-2 align-top">{day ? <>{day.startsAt.slice(0, 5)}–{day.endsAt.slice(0, 5)}{day.afternoonStartsAt && <span className="block">{day.afternoonStartsAt.slice(0, 5)}–{day.afternoonEndsAt.slice(0, 5)}</span>}</> : <span className="text-muted">Unavailable</span>}</td>; })}</tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-muted">This matrix shows submitted preferences awaiting your review. Approval still checks existing assignments and office capacity on the server.</p>
    </Card>}
    {data && (data.schedules.length ? <div className="space-y-4">{visibleSchedules.map((schedule) => <Card key={schedule.id}>
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{schedule.studentName}</h2><p className="text-sm text-muted">{schedule.studentEmail} · {schedule.officeName} · {schedule.requestKind === 'change' ? 'Change request' : 'Initial proposal'} · version {schedule.version}</p></div><span className="text-sm font-medium text-teal">{schedule.status.replaceAll('_', ' ')}</span></div>
      <p className="mt-3 text-sm">{schedule.effectiveStartsOn} through {schedule.effectiveEndsOn}</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{schedule.days.map((day) => <li key={day.weekday}>{week[day.weekday - 1]}: {formatDutyPeriods(day)}</li>)}</ul>
      {schedule.requirement && <div className="mt-4 rounded-lg bg-canvas p-3"><p className="text-sm font-medium">Applicable duty rules</p><p className="mt-1 text-sm text-muted">{schedule.requirement.requiredTermHours ?? 'No total target'} required hours · {schedule.requirement.minimumDailyHours} h minimum/day{schedule.requirement.maximumDailyHours == null ? '' : ` · ${schedule.requirement.maximumDailyHours} h maximum/day`}</p><p className="text-sm text-muted">Permitted: {schedule.requirement.permittedWeekdays.map((day) => week[day - 1]).join(', ')} · {schedule.requirement.permittedTimeWindows.map((window) => `${window.startTime}–${window.endTime}`).join(', ')} · deadline {schedule.requirement.completionDeadline ?? schedule.requirement.term.endsOn}</p></div>}
      {schedule.feasibility && <div className={`mt-3 rounded-lg p-3 text-sm ${schedule.feasibility.feasible ? 'bg-ok-bg text-ok-fg' : 'bg-warn-bg text-warn-fg'}`}><p className="font-medium">Capacity estimate: {schedule.feasibility.estimatedCapacityHours.toFixed(2)} h possible before {schedule.feasibility.deadline}; {schedule.feasibility.remainingHours == null ? 'total requirement missing' : `${schedule.feasibility.remainingHours.toFixed(2)} h remaining`}{schedule.feasibility.estimatedShortfallHours > 0 ? `; estimated shortfall ${schedule.feasibility.estimatedShortfallHours.toFixed(2)} h` : ''}.</p><p className="mt-1 text-xs">{schedule.feasibility.note}</p></div>}
      {schedule.potentialConflicts?.length > 0 && <div className="mt-3 rounded-lg border border-warn-fg/30 p-3"><p className="text-sm font-medium">Potential preference overlaps</p><ul className="mt-1 list-inside list-disc text-sm text-muted">{schedule.potentialConflicts.map((conflict, index) => <li key={`${conflict.studentName}-${conflict.weekday}-${index}`}>{week[conflict.weekday - 1]} {conflict.startsAt}–{conflict.endsAt} overlaps {conflict.studentName}'s approved preference.</li>)}</ul><p className="mt-1 text-xs text-muted">These are advisory overlaps; confirm office capacity. They do not restrict QR attendance.</p></div>}
      {schedule.assignmentConflicts?.length > 0 && <div role="alert" className="mt-3 rounded-lg border border-bad-fg/30 p-3 text-sm text-bad-fg"><p className="font-medium">Approval blocked by confirmed assignment conflicts</p><ul className="mt-1 list-inside list-disc">{schedule.assignmentConflicts.map((conflict, index) => <li key={`${conflict.code}-${conflict.weekday}-${conflict.startsAt}-${index}`}>{week[conflict.weekday - 1]} {conflict.startsAt}–{conflict.endsAt}: {conflict.message}</li>)}</ul></div>}
      <label className="mt-4 block text-sm text-muted">Reason / feedback (required for rejection or revision)<textarea className={`mt-1 ${field}`} rows="2" maxLength="1000" value={reasons[schedule.id] ?? ''} onChange={(e) => setReasons((current) => ({ ...current, [schedule.id]: e.target.value }))} /></label>
      <fieldset className="mt-3"><legend className="text-sm font-medium">Suggested duty times (optional; sent with a revision request)</legend><div className="mt-2 flex flex-wrap gap-3">{(suggestions[schedule.id] ?? []).map((day, index) => <div key={day.weekday} className="rounded-lg border border-line p-2"><p className="mb-1 text-xs text-muted">{week[day.weekday - 1]} · SA proposed {formatDutyPeriods(schedule.days.find((item) => item.weekday === day.weekday) ?? day)}</p><div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted">Morning start<input className={`mt-1 ${field}`} type="time" value={day.startsAt} onChange={(e) => setSuggestions((current) => ({ ...current, [schedule.id]: current[schedule.id].map((item, i) => i === index ? { ...item, startsAt: e.target.value } : item) }))} /></label><label className="text-xs text-muted">Morning end<input className={`mt-1 ${field}`} type="time" value={day.endsAt} onChange={(e) => setSuggestions((current) => ({ ...current, [schedule.id]: current[schedule.id].map((item, i) => i === index ? { ...item, endsAt: e.target.value } : item) }))} /></label><label className="col-span-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={Boolean(day.afternoonStartsAt && day.afternoonEndsAt)} onChange={(e) => setSuggestions((current) => ({ ...current, [schedule.id]: current[schedule.id].map((item, i) => i === index ? { ...item, afternoonStartsAt: e.target.checked ? '13:00' : null, afternoonEndsAt: e.target.checked ? '16:00' : null } : item) }))} />Include afternoon period</label>{day.afternoonStartsAt && day.afternoonEndsAt && <><label className="text-xs text-muted">Afternoon start<input className={`mt-1 ${field}`} type="time" value={day.afternoonStartsAt.slice(0, 5)} onChange={(e) => setSuggestions((current) => ({ ...current, [schedule.id]: current[schedule.id].map((item, i) => i === index ? { ...item, afternoonStartsAt: e.target.value } : item) }))} /></label><label className="text-xs text-muted">Afternoon end<input className={`mt-1 ${field}`} type="time" value={day.afternoonEndsAt.slice(0, 5)} onChange={(e) => setSuggestions((current) => ({ ...current, [schedule.id]: current[schedule.id].map((item, i) => i === index ? { ...item, afternoonEndsAt: e.target.value } : item) }))} /></label></>}</div></div>)}</div></fieldset>
      <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busyId === schedule.id || schedule.assignmentConflicts?.length > 0} onClick={() => decide(schedule, 'approve')}>Approve schedule</Button><Button disabled={busyId === schedule.id || !(reasons[schedule.id] ?? '').trim()} onClick={() => decide(schedule, 'request_changes')}>Request revision</Button><Button disabled={busyId === schedule.id || !(reasons[schedule.id] ?? '').trim()} onClick={() => decide(schedule, 'reject')}>Reject</Button></div>
    </Card>)}</div> : <Card><p>No schedule proposals are waiting for review.</p></Card>)}
    {data && <Pagination page={currentPage} total={schedules.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading || !!busyId} label="Duty Schedule Review pagination" recordLabel="Schedules" />}
  </>;
}
