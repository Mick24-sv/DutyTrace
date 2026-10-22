import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiPut } from '../../services/api.js';
import RecoveryPlanner from '../../components/recovery/RecoveryPlanner.jsx';

const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const field = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm';
const statuses = { draft: 'Draft', pending_review: 'Pending supervisor review', approved: 'Approved preference', rejected: 'Rejected', change_requested: 'Revision requested' };

export default function DutySchedulePage() {
  const [tick, setTick] = useState(0);
  const query = useApiData(`/duty-schedules/mine?_=${tick}`);
  const progressQuery = useApiData(`/semesters/mine?_=${tick}`);
  const entries = query.data?.terms ?? [];
  const terms = progressQuery.data?.terms ?? [];
  const [termId, setTermId] = useState('');
  const item = entries.find((entry) => entry.term.id === termId) ?? entries.find((entry) => entry.term.isCurrent) ?? entries[0];
  const proposal = item?.proposal;
  const progress = terms.find((term) => term.id === item?.term.id);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [changeMode, setChangeMode] = useState(false);
  const editable = !proposal || ['draft', 'rejected', 'change_requested'].includes(proposal.status) || changeMode;
  useEffect(() => {
    if (!item) return;
    setTermId(item.term.id);
    setStartDate(proposal?.effectiveStartsOn ?? item.term.startsOn);
    setEndDate(proposal?.effectiveEndsOn ?? item.term.endsOn);
    setDays(proposal?.days ?? []);
  }, [item?.term.id, proposal?.id, proposal?.updatedAt]);
  const requirement = item?.requirement;
  const feasibility = item?.feasibility;
  const weeklyHours = useMemo(() => days.reduce((sum, day) => {
    const duration = (start, end) => start && end
      ? (Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5))
        - Number(start.slice(0, 2)) * 60 - Number(start.slice(3, 5))) / 60
      : 0;
    return sum + Math.max(0, duration(day.startsAt, day.endsAt) + duration(day.afternoonStartsAt, day.afternoonEndsAt));
  }, 0), [days]);
  const setDay = (weekday, patch) => setDays((current) => {
    const found = current.find((day) => day.weekday === weekday);
    if (!found) return [...current, { weekday, startsAt: '09:00', endsAt: '12:00', ...patch }].sort((a, b) => a.weekday - b.weekday);
    return current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day);
  });
  const toggleDay = (weekday, enabled) => setDays((current) => enabled
    ? [...current, { weekday, startsAt: '09:00', endsAt: '12:00' }].sort((a, b) => a.weekday - b.weekday)
    : current.filter((entry) => entry.weekday !== weekday));
  const toggleAfternoon = (weekday, enabled) => setDay(weekday, enabled
    ? { afternoonStartsAt: '13:00', afternoonEndsAt: '16:00' }
    : { afternoonStartsAt: null, afternoonEndsAt: null });
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = { effectiveStartsOn: startDate, effectiveEndsOn: endDate, days };
      if (proposal && proposal.status !== 'approved') await apiPut(`/duty-schedules/${proposal.id}`, payload);
      else if (proposal?.status === 'approved') await apiPost('/duty-schedules', { termId: item.term.id, ...payload });
      else await apiPost('/duty-schedules', { termId: item.term.id, ...payload });
      setMessage(proposal?.status === 'approved' ? 'Your change request was saved as a draft.' : 'Your preferred duty hours were saved as a draft.'); setChangeMode(false); setTick((value) => value + 1);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError(''); setMessage('');
    try {
      let schedule = proposal;
      const payload = { effectiveStartsOn: startDate, effectiveEndsOn: endDate, days };
      if (schedule && schedule.status !== 'approved') await apiPut(`/duty-schedules/${schedule.id}`, payload);
      else schedule = (await apiPost('/duty-schedules', { termId: item.term.id, ...payload })).schedule;
      await apiPost(`/duty-schedules/${schedule.id}/submit`, {});
      setMessage('Your schedule preference was submitted for supervisor review.'); setChangeMode(false); setTick((value) => value + 1);
    } catch (err) {
      const details = err.details ? Object.values(err.details).join(' ') : '';
      setError(details || err.message);
    } finally { setBusy(false); }
  }
  if (query.loading || progressQuery.loading) return <p role="status" className="text-sm text-muted">Loading schedule and term progress…</p>;
  if (query.error) return <p role="alert" className="text-bad-fg">{query.error}</p>;
  if (!entries.length) return <><PageHeader title="My Duty Preferences" description="Propose duty hours around your class schedule." /><Card><p>No academic term is available. Contact your administrator.</p></Card></>;
  return <>
    <PageHeader title="My Duty Preferences" description="These are preferences for review. They do not authorize attendance or prevent a valid office QR scan." />
    <div className="mb-4"><label className="text-sm text-muted">Academic term<select className={`mt-1 block ${field}`} value={item.term.id} onChange={(e) => setTermId(e.target.value)}>{entries.map(({ term }) => <option key={term.id} value={term.id}>{term.academicYear} · {term.semester}{term.isCurrent ? ' (Current)' : ''}</option>)}</select></label></div>
    <Card className="mb-5" title="Applicable requirement and progress">
      {requirement?.policy ? <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p className="min-w-0 rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Required: <strong>{requirement.requiredTermHours ?? 'Unassigned'} h</strong><span className="block break-words text-xs text-muted">{requirement.totalHoursSource ?? 'No total requirement source'}</span></p>
        <p className="min-w-0 rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Verified: <strong>{progress?.verifiedHours ?? 0} h</strong><span className="block break-words text-xs text-muted">Approved DTR hours</span></p>
        <p className="min-w-0 rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Recorded: <strong>{progress?.recordedHours ?? 0} h</strong><span className="block break-words text-xs text-muted">Attendance records; not necessarily verified</span></p>
        <p className="min-w-0 rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Remaining: <strong>{requirement.requiredTermHours == null ? '—' : `${Math.max(0, requirement.requiredTermHours - (progress?.verifiedHours ?? 0)).toFixed(2)} h`}</strong><span className="block break-words text-xs text-muted">Verified hours are subtracted from required hours</span></p>
        <p className="min-w-0 rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Minimum per duty day: <strong>{requirement.minimumDailyHours} h</strong><span className="block break-words text-xs text-muted">Maximum: {requirement.maximumDailyHours == null ? 'not set' : `${requirement.maximumDailyHours} h`}</span></p>
        <p className="min-w-0 break-words rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Permitted days: <strong>{requirement.permittedWeekdays.map((day) => week[day - 1]).join(', ') || 'Not configured'}</strong></p>
        <p className="min-w-0 break-words rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Permitted windows: <strong>{requirement.permittedTimeWindows.map((window) => `${window.startTime}–${window.endTime}`).join(', ') || 'Not configured'}</strong></p>
        <p className="min-w-0 break-words rounded-md bg-canvas p-2 sm:bg-transparent sm:p-0">Completion deadline: <strong>{requirement.completionDeadline ?? 'Not configured'}</strong></p>
      </div> : <p className="text-sm text-muted">No effective duty policy is configured for this term and office yet. Contact the administrator.</p>}
    </Card>
    {feasibility && <Card className="mb-5" title="Schedule capacity estimate">
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="min-w-0 break-words rounded-md border border-line bg-canvas p-3 text-sm leading-relaxed">Estimated schedule capacity before <strong>{feasibility.deadline}</strong><span className="mt-1 block text-base font-semibold text-ink">{feasibility.estimatedCapacityHours.toFixed(2)} h</span><span className="block text-xs text-muted">Across {feasibility.eligibleOccurrences} remaining proposed duty days</span></p>
        <p className="min-w-0 break-words rounded-md border border-line bg-canvas p-3 text-sm leading-relaxed">Estimated remaining requirement<span className="mt-1 block text-base font-semibold text-ink">{feasibility.remainingHours == null ? 'Not configured' : `${feasibility.remainingHours.toFixed(2)} h`}</span>{feasibility.estimatedShortfallHours > 0 && <span className="mt-1 block text-xs text-muted">Estimated shortfall: {feasibility.estimatedShortfallHours.toFixed(2)} h</span>}</p>
      </div>
      {feasibility.guidance.map((note) => <p key={note} className="mt-2 break-words text-sm leading-relaxed text-muted">{note}</p>)}
      {!!item.validationIssues?.length && <ul className="mt-3 list-inside list-disc text-sm text-bad-fg">{item.validationIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}
      <p className="mt-3 text-xs text-muted">{feasibility.note} Proposed hours are not worked, recorded, or verified hours.</p>
    </Card>}
    {proposal && <Card className="mb-5">
      <p className="font-medium">{statuses[proposal.status]} · version {proposal.version}</p>
      {proposal.reviewReason && <p className="mt-2 break-words text-sm leading-relaxed text-muted"><span className="font-medium text-ink">Reviewer feedback:</span> {proposal.reviewReason}</p>}
      {proposal.suggestedDays?.length > 0 && <div className="mt-3">
        <p className="text-sm font-medium">Supervisor suggested alternatives (your preference is unchanged):</p>
        <ul className="mt-1 list-inside list-disc space-y-1 break-words text-sm leading-relaxed text-muted">{proposal.suggestedDays.map((day) => <li key={day.weekday}>{week[day.weekday - 1]}: {day.startsAt}–{day.endsAt}{day.afternoonStartsAt && day.afternoonEndsAt ? ` · afternoon ${day.afternoonStartsAt}–${day.afternoonEndsAt}` : ''}</li>)}</ul>
      </div>}
      {item.attendanceMonitoring && <p className="mt-3 break-words rounded-md bg-canvas p-3 text-xs leading-relaxed text-muted">Attendance monitoring: {item.attendanceMonitoring.outsidePreferenceEvents} of {item.attendanceMonitoring.measuredEvents} attendance events were outside the approved preference. This is informational and never blocks scanning.</p>}
    </Card>}
    {error && <p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}{message && <p role="status" className="mb-3 text-sm text-teal">{message}</p>}
    {editable && <Card title="Propose weekly duty times">
      <form onSubmit={save}>
        <p className="mb-4 text-sm text-muted">Select duty days that work around your classes. These are proposed preferences and must be approved before they are monitored as an approved schedule.</p>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">{[[startDate, setStartDate, 'Preference starts'], [endDate, setEndDate, 'Preference ends']].map(([value, set, label]) => <label key={label} className="text-sm text-muted">{label}<input className={`mt-1 block ${field}`} type="date" min={item.term.startsOn} max={item.term.endsOn} required value={value} onChange={(e) => set(e.target.value)} /></label>)}</div>
        <div className="space-y-3">
          {week.map((name, index) => {
            const weekday = index + 1;
            const day = days.find((entry) => entry.weekday === weekday);
            return <div key={weekday} className="grid grid-cols-1 items-center gap-4 rounded-lg border border-line p-3 md:grid-cols-[minmax(7rem,0.7fr)_minmax(17rem,1fr)_minmax(21rem,1.3fr)]">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(day)} onChange={(event) => toggleDay(weekday, event.target.checked)} />{name}</label>
              {day && <>
                <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
                  <span className="col-span-4 text-xs font-medium text-muted">Morning</span>
                  <label className="text-xs text-muted">Start</label><input aria-label={`${name} morning start`} className={field} type="time" value={day.startsAt.slice(0, 5)} onChange={(event) => setDay(weekday, { startsAt: event.target.value })} />
                  <label className="text-xs text-muted">End</label><input aria-label={`${name} morning end`} className={field} type="time" value={day.endsAt.slice(0, 5)} onChange={(event) => setDay(weekday, { endsAt: event.target.value })} />
                </div>
                <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2">
                  <span className="col-span-4 text-xs font-medium text-muted">Afternoon <span className="font-normal">(optional)</span></span>
                  {day.afternoonStartsAt && day.afternoonEndsAt ? <>
                    <label className="text-xs text-muted">Start</label><input aria-label={`${name} afternoon start`} className={field} type="time" value={day.afternoonStartsAt.slice(0, 5)} onChange={(event) => setDay(weekday, { afternoonStartsAt: event.target.value })} />
                    <label className="text-xs text-muted">End</label><input aria-label={`${name} afternoon end`} className={field} type="time" value={day.afternoonEndsAt.slice(0, 5)} onChange={(event) => setDay(weekday, { afternoonEndsAt: event.target.value })} />
                    <button type="button" className="col-span-4 justify-self-start text-xs text-teal underline" onClick={() => toggleAfternoon(weekday, false)}>Remove afternoon period</button>
                  </> : <button type="button" className="col-span-4 justify-self-start text-sm text-teal underline" onClick={() => toggleAfternoon(weekday, true)}>+ Add afternoon period</button>}
                </div>
              </>}
            </div>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : proposal?.status === 'approved' ? 'Save change draft' : 'Save draft'}</Button><Button type="button" disabled={busy || !days.length || !requirement?.policy} onClick={submit}>{busy ? 'Submitting…' : proposal?.status === 'approved' ? 'Request a change' : 'Submit for review'}</Button><span className="text-sm text-muted">Proposed weekly hours: {weeklyHours.toFixed(2)} h</span></div>
      </form>
    </Card>}
    {!editable && proposal?.status === 'approved' && <Button type="button" onClick={() => setChangeMode(true)}>Request a schedule change</Button>}
    <div className="mt-5"><RecoveryPlanner termId={item?.term.id} /></div>
  </>;
}
