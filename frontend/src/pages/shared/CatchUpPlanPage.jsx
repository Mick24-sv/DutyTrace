import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, FileCheck2, Flag, Info, Plus, Route, Send, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiPut } from '../../services/api.js';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import SemesterStatusBadge from '../../components/attendance/SemesterStatusBadge.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { DUTY_WEEKDAYS, catchUpEstimate, catchUpIssues, dutyDayHours } from '../../utils/catchUp.js';
import '../../components/dashboard/catch-up.css';

const hours = value => `${Number(value??0).toFixed(2)} h`;
const dateLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00Z`));
const periodLabel=day=>`${day.startsAt}–${day.endsAt}${day.afternoonStartsAt?` · ${day.afternoonStartsAt}–${day.afternoonEndsAt}`:''}`;

function CatchUpDetails({data,role,reload}) {
  const {student,term,approvedSchedule,proposal,requirement,suggestions,pendingDtrs}=data;
  const isStudent=role==='student';
  const [days,setDays]=useState(()=>structuredClone(proposal?.days??approvedSchedule?.days??[]));
  const [draftId,setDraftId]=useState(proposal?.id??null);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const [sent,setSent]=useState(false);
  const pending=proposal?.status==='pending_review'||sent;
  const editable=isStudent&&!pending&&!term.finalizedAt&&data.startsOn<=data.endsOn&&student.semesterStatus==='at_risk';
  const issues=catchUpIssues(days,requirement);
  const estimate=issues.length?null:catchUpEstimate({days,startsOn:data.startsOn,endsOn:data.endsOn,today:data.today,recordedHoursToday:student.recordedHoursToday,remainingHours:student.remainingHours});
  const improved=estimate&&estimate.capacityHours>(student.scheduledHoursRemaining??0);
  const reviewUrl=`/supervisor/schedule-review?termId=${encodeURIComponent(term.id)}&studentId=${encodeURIComponent(student.id)}`;
  function changeDay(weekday,patch) {setDays(current=>current.map(day=>day.weekday===weekday?{...day,...patch}:day));setSelected('');setError('');}
  function toggleDay(weekday) {
    setSelected('');
    setDays(current=>current.some(day=>day.weekday===weekday)?current.filter(day=>day.weekday!==weekday):[...current,{weekday,startsAt:'09:00',endsAt:'12:00',afternoonStartsAt:null,afternoonEndsAt:null}].sort((a,b)=>a.weekday-b.weekday));
  }
  async function submit() {
    setBusy(true);setError('');
    const body={effectiveStartsOn:data.startsOn,effectiveEndsOn:data.endsOn,days};
    try {
      let id=draftId;
      if(id) await apiPut(`/duty-schedules/${id}`,body);
      else {const result=await apiPost('/duty-schedules',{...body,termId:term.id});id=result.schedule.id;setDraftId(id);}
      await apiPost(`/duty-schedules/${id}/submit`,{});
      setSent(true);setConfirm(false);reload();
    } catch(err) {setError(err.message);setConfirm(false);} finally {setBusy(false);}
  }
  return <>
    <header className="catch-up-heading"><div><span className="catch-up-eyebrow"><Route size={14} aria-hidden="true" />DUTY SUPPORT</span><h1>{isStudent?'Your catch-up plan':`${student.fullName}’s catch-up plan`}</h1><p>{term.academicYear} · {{first:'First semester',second:'Second semester',summer:'Summer term'}[term.semester]} · {student.officeName}</p></div><SemesterStatusBadge status={student.semesterStatus}/></header>
    <section className="catch-up-hero" aria-labelledby="catch-up-summary"><div className="catch-up-hero-title"><span><Flag size={23} aria-hidden="true"/></span><div><h2 id="catch-up-summary">{student.semesterStatus==='at_risk'?`${hours(data.shortfallHours)} more to schedule`:student.semesterStatus==='on_track'?'Your approved schedule is on track':'Your current duty-hour standing'}</h2><p>{student.semesterStatus==='at_risk'?'A few schedule adjustments can help close the gap. Start with the hours below.':'This plan reflects the latest verified hours and approved duty preferences.'}</p></div></div><dl className="catch-up-metrics"><div><dt><FileCheck2 size={14} aria-hidden="true"/>Verified / required</dt><dd>{hours(student.verifiedHours)} <small>/ {hours(student.requiredHours)}</small></dd></div><div><dt><Clock3 size={14} aria-hidden="true"/>Still to complete</dt><dd>{hours(student.remainingHours)}</dd></div><div><dt><CalendarDays size={14} aria-hidden="true"/>Already scheduled</dt><dd>{student.scheduledHoursRemaining==null?'Not available':hours(student.scheduledHoursRemaining)}</dd></div><div><dt><Flag size={14} aria-hidden="true"/>Planning deadline</dt><dd className="catch-up-date">{dateLabel(data.endsOn)}</dd></div></dl><p className="catch-up-disclaimer"><Info size={13} aria-hidden="true"/>Scheduled hours are a forecast. Only verified work counts toward completion.</p></section>
    {pendingDtrs.length>0&&<section className="catch-up-verification"><FileCheck2 size={20} aria-hidden="true"/><div><h2>Check unverified work first</h2><p>{pendingDtrs.length} monthly {pendingDtrs.length===1?'DTR has':'DTRs have'} not been approved. Review these records before committing to extra duty.</p><div className="catch-up-dtr-list">{pendingDtrs.map(dtr=><span key={dtr.month}>{dtr.month} <DtrStatusBadge status={dtr.status}/></span>)}</div></div><Link to={isStudent?'/student/dtr':role==='supervisor'?'/supervisor/dtr-review':'/admin/dtrs'}>Review DTRs<ArrowUpRight size={14} aria-hidden="true"/></Link></section>}
    {pending&&<div role="status" className="catch-up-notice success"><CheckCircle2 size={20} aria-hidden="true"/><div><strong>Schedule submitted for review</strong><p>The current approved schedule stays in effect until the revision is approved. Standing updates after approval.</p></div></div>}
    {proposal?.reviewReason&&<div className="catch-up-notice"><Info size={20} aria-hidden="true"/><div><strong>Supervisor feedback</strong><p>{proposal.reviewReason}</p></div></div>}
    <div className="catch-up-layout"><div className="catch-up-main">
      <section className="catch-up-card"><header><span className="catch-up-section-icon violet"><Sparkles size={19} aria-hidden="true"/></span><div><h2>Ways to close the gap</h2><p>Recurring schedule options within the current duty rules.</p></div></header><div className="catch-up-card-body">
        {suggestions.length>0?<div className="catch-up-options">{suggestions.map((option,index)=><article key={option.id} className={`catch-up-option ${selected===option.id?'selected':''}`}><div className="catch-up-option-top"><span className="catch-up-option-number">0{index+1}</span><span className={option.shortfallHours===0?'catch-up-option-fit':'catch-up-option-partial'}>{option.shortfallHours===0?'Covers the gap':'Partial catch-up'}</span></div><h3>{option.kind==='extend'?'Extend':'Add'} {DUTY_WEEKDAYS[option.weekday-1]} duty</h3><p>{periodLabel(option.days.find(day=>day.weekday===option.weekday))}</p><strong>+{hours(option.extraHoursPerWeek)} / week</strong><p>{hours(option.capacityHours)} scheduled in total{option.shortfallHours>0?` · ${hours(option.shortfallHours)} still to arrange`:''}</p>{editable&&<button type="button" aria-pressed={selected===option.id} onClick={()=>{setDays(structuredClone(option.days));setSelected(option.id);setError('');}}>{selected===option.id?<CheckCircle2 size={14} aria-hidden="true"/>:<Plus size={14} aria-hidden="true"/>}{selected===option.id?'Selected':'Use this option'}</button>}</article>)}</div>:<p className="catch-up-empty">{student.semesterStatus!=='at_risk'?'No additional catch-up hours are currently suggested.':'No automatic option fits the current rules and confirmed office capacity. Discuss a combined schedule adjustment with the supervisor.'}</p>}
        <p className="catch-up-small"><ShieldCheck size={13} aria-hidden="true"/>Suggestions are checked against duty rules and current confirmed office capacity. Confirm class availability; approval checks capacity again.</p>
      </div></section>
      <section className="catch-up-card"><header><span className="catch-up-section-icon blue"><CalendarDays size={19} aria-hidden="true"/></span><div><h2>{isStudent?'Build your revised preferences':proposal?'Proposed duty preferences':'Approved duty preferences'}</h2><p>{dateLabel(data.startsOn)} – {dateLabel(data.endsOn)} · Recurs weekly</p></div>{proposal&&<span className="catch-up-proposal-status">{proposal.status.replaceAll('_',' ')}</span>}</header><div className="catch-up-card-body">
        {editable?<fieldset disabled={busy} className="catch-up-editor"><legend className="sr-only">Revised weekly duty preferences</legend>{DUTY_WEEKDAYS.map((label,index)=>{const weekday=index+1;const day=days.find(day=>day.weekday===weekday);return <div className={`catch-up-day ${day?'enabled':''}`} key={weekday}><label className="catch-up-day-toggle"><input type="checkbox" checked={Boolean(day)} disabled={!day&&!requirement.permittedWeekdays.includes(weekday)} onChange={()=>toggleDay(weekday)}/><span>{label}</span>{day&&<small>{Number.isFinite(dutyDayHours(day))?hours(dutyDayHours(day)):'Check times'}</small>}</label>{day&&<div className="catch-up-time-fields"><label>Start<input required aria-label={`${label} start`} type="time" value={day.startsAt} onChange={e=>changeDay(weekday,{startsAt:e.target.value})}/></label><label>End<input required aria-label={`${label} end`} type="time" value={day.endsAt} onChange={e=>changeDay(weekday,{endsAt:e.target.value})}/></label><label className="catch-up-split"><input type="checkbox" checked={Boolean(day.afternoonStartsAt)} onChange={e=>changeDay(weekday,{afternoonStartsAt:e.target.checked?'13:00':null,afternoonEndsAt:e.target.checked?'16:00':null})}/>Afternoon period</label>{day.afternoonStartsAt&&<><label>Afternoon start<input required aria-label={`${label} afternoon start`} type="time" value={day.afternoonStartsAt} onChange={e=>changeDay(weekday,{afternoonStartsAt:e.target.value})}/></label><label>Afternoon end<input required aria-label={`${label} afternoon end`} type="time" value={day.afternoonEndsAt} onChange={e=>changeDay(weekday,{afternoonEndsAt:e.target.value})}/></label></>}</div>}</div>;})}</fieldset>:<ul className="catch-up-readonly-days">{days.map(day=><li key={day.weekday}><strong>{DUTY_WEEKDAYS[day.weekday-1]}</strong><span>{periodLabel(day)}</span><b>{hours(dutyDayHours(day))}</b></li>)}</ul>}
        {editable&&proposal?.suggestedDays?.length>0&&<Button variant="secondary" className="mt-4" onClick={()=>{setDays(structuredClone(proposal.suggestedDays));setSelected('');}}>Use supervisor’s suggested times</Button>}
        {editable&&issues.length>0&&<div className="catch-up-errors" role="status"><strong>Adjust your preferences</strong><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
        {error&&<p role="alert" className="catch-up-errors">{error}</p>}
      </div></section>
    </div><aside className="catch-up-aside">
      <section className="catch-up-card catch-up-preview"><header><span className="catch-up-section-icon teal"><Route size={19} aria-hidden="true"/></span><div><h2>Plan preview</h2><p>{pending?'Awaiting approval':'Estimate before approval'}</p></div></header><div className="catch-up-card-body"><dl><div><dt>Remaining requirement</dt><dd>{hours(student.remainingHours)}</dd></div><div><dt>Revised scheduled hours</dt><dd>{estimate?hours(estimate.capacityHours):'Check times'}</dd></div><div className="catch-up-preview-total"><dt>Gap after this plan</dt><dd>{estimate?hours(estimate.shortfallHours):'—'}</dd></div></dl>{estimate&&<p className={`catch-up-preview-message ${estimate.shortfallHours===0?'covered':''}`}>{estimate.shortfallHours===0?<CheckCircle2 size={17} aria-hidden="true"/>:<TriangleAlert size={17} aria-hidden="true"/>}{estimate.shortfallHours===0?'This schedule can cover the remaining hours.':`${hours(estimate.shortfallHours)} still needs a schedule adjustment.`}</p>}
        {editable&&<><Button variant="accent" icon={Send} disabled={busy||issues.length>0||!improved} onClick={()=>setConfirm(true)}>Submit catch-up plan</Button><p className="catch-up-small">Sends revised duty preferences to your supervisor. You can submit a partial plan if it improves your scheduled hours.</p></>}
        {role==='supervisor'&&proposal?.status==='pending_review'&&<Link className="catch-up-primary-link" to={reviewUrl}>Review submitted preferences<ArrowUpRight size={15} aria-hidden="true"/></Link>}
        {role==='supervisor'&&proposal?.status!=='pending_review'&&<p className="catch-up-small">The student submits a revised preference first. You can then approve it or request changes in Schedule Review.</p>}
        {role==='admin'&&<Link className="catch-up-primary-link" to="/admin/semesters">Manage requirements & deadlines<ArrowUpRight size={15} aria-hidden="true"/></Link>}
      </div></section>
      <section className="catch-up-card catch-up-rules"><h2><ShieldCheck size={17} aria-hidden="true"/>Duty rules</h2><p>{requirement.minimumDailyHours} h minimum per day{requirement.maximumDailyHours!=null?` · ${requirement.maximumDailyHours} h maximum`:''}{requirement.maximumWeeklyHours!=null?` · ${requirement.maximumWeeklyHours} h weekly limit`:''}</p><p>{requirement.permittedWeekdays.filter(day=>day<=6).map(day=>DUTY_WEEKDAYS[day-1].slice(0,3)).join(' · ')}</p><div>{requirement.permittedTimeWindows.map((window,index)=><span key={index}>{window.startTime.slice(0,5)}–{window.endTime.slice(0,5)}</span>)}</div><p className="catch-up-small">If extra duty is not possible, discuss the remaining requirement with your supervisor. Any deadline change requires administrator approval.</p></section>
    </aside></div>
    <ConfirmDialog open={confirm} title="Submit revised duty preferences?" confirmLabel="Submit for review" busy={busy} onCancel={()=>setConfirm(false)} onConfirm={submit}><p>This recurring schedule provides an estimated <strong>{hours(estimate?.capacityHours)}</strong> before {dateLabel(data.endsOn)}. {estimate?.shortfallHours>0?`${hours(estimate.shortfallHours)} would still need to be arranged.`:'It can cover your remaining requirement.'}</p><p className="mt-3">Confirm these times fit your classes. Your approved schedule changes only after supervisor approval.</p></ConfirmDialog>
  </>;
}

export default function CatchUpPlanPage() {
  const {user}=useAuth();
  const {termId,studentId}=useParams();
  const [revision,setRevision]=useState(0);
  const {data,loading,error}=useApiData(`/semesters/${termId}/catch-up/${studentId}?revision=${revision}`);
  if(!user) return <p role="status" className="catch-up-loading">Loading your account…</p>;
  return <div className="catch-up-page"><Link className="catch-up-back" to={`/${user.role}`}><ArrowLeft size={15} aria-hidden="true"/>Back to home</Link>{loading?<p role="status" className="catch-up-loading">Preparing the catch-up plan…</p>:error?<div className="catch-up-errors" role="alert"><h1>Unable to load catch-up plan</h1><p>{error}</p><Button variant="secondary" onClick={()=>setRevision(value=>value+1)}>Try again</Button></div>:data&&<CatchUpDetails key={`${termId}-${studentId}-${revision}`} data={data} role={user.role} reload={()=>setRevision(value=>value+1)}/>}</div>;
}
