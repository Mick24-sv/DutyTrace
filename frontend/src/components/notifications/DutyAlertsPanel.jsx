import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import Card from '../ui/Card.jsx';
import { apiGet, apiPatch, apiPut } from '../../services/api.js';

const PAGE_SIZE=7;
const studentFilters=[['all','All'],['unread','Unread'],['informational','Info'],['warning','Warning'],['critical','Critical']];
const oversightFilters=[['all','All severity'],['informational','Info'],['warning','Warning'],['critical','Critical']];
const categories=['completion_risk','deadline','upcoming_shift','attendance','missed_shift','recovery','transition','schedule_conflict','dtr','absence','compliance','documents','semester_requirement'];
const tone={informational:'bg-info-bg text-info-fg',warning:'bg-warn-bg text-warn-fg',critical:'bg-bad-bg text-bad-fg'};

export default function DutyAlertsPanel({role='student'}){
  const [filter,setFilter]=useState('all');const [items,setItems]=useState([]);const [unread,setUnread]=useState(0);const [summary,setSummary]=useState(null);
  const [officeOptions,setOfficeOptions]=useState([]);const [queryFilters,setQueryFilters]=useState({officeId:'',category:'',status:'active'});
  const [page,setPage]=useState(0);const [pageCursors,setPageCursors]=useState([null]);const requestId=useRef(0);
  const cursor=pageCursors[page]??null;
  const resetPages=()=>{setPage(0);setPageCursors([null]);};
  const [nextCursor,setNextCursor]=useState(null);const [totalAlerts,setTotalAlerts]=useState(0);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [prefs,setPrefs]=useState(null);
  const [saving,setSaving]=useState(false);const [showPrefs,setShowPrefs]=useState(false);const [showPolicy,setShowPolicy]=useState(false);const [policy,setPolicy]=useState(null);const navigate=useNavigate();
  const load=useCallback(async()=>{const request=++requestId.current;setLoading(true);setError('');try{
    const [alerts,preferences,totals]=await Promise.all([role==='student'
      ?apiGet(`/notifications?filter=${filter}`)
      :apiGet(`/notifications/oversight?${new URLSearchParams({status:queryFilters.status,category:queryFilters.category,limit:String(PAGE_SIZE),...(cursor?{cursor}:{}),...(filter==='all'?{}:{severity:filter}),...(queryFilters.officeId?{officeId:queryFilters.officeId}:{})})}`),
      role==='student'?apiGet('/notifications/preferences'):Promise.resolve(null),apiGet('/notifications/summary')]);
    if(request!==requestId.current)return;
    setItems(role==='student'?alerts.notifications:alerts.alerts);setUnread(role==='student'?alerts.unreadCount:totals.unread);if(preferences)setPrefs(preferences);
    setNextCursor(role==='student'?alerts.nextCursor:alerts.nextCursor);if(page===0)setTotalAlerts(role==='student'?alerts.notifications.length:alerts.total);
    setSummary(totals);
  }catch(e){if(request===requestId.current)setError(e.message);}finally{if(request===requestId.current)setLoading(false);}},[filter,queryFilters,role,cursor,page]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(role==='admin')apiGet('/offices').then(data=>setOfficeOptions(data.offices??[])).catch(()=>{});},[role]);
  useEffect(()=>{if(role==='admin')apiGet('/notifications/policy').then(({policy:value})=>setPolicy(value)).catch(e=>setError(e.message));},[role]);
  const markRead=async(item)=>{try{if(role==='student'&&!item.readAt){await apiPatch(`/notifications/${item.id}/read`,{});setUnread(n=>Math.max(0,n-1));}
    const path=item.actionUrl?.startsWith('/')&&!item.actionUrl.startsWith('//')?item.actionUrl:
      item.relatedType==='attendance_discrepancy'?`/${role}/discrepancies`:
      item.relatedType==='duty_recovery_plan'?role==='student'?'/student/schedule':'/supervisor/recovery-review':
      item.relatedType==='academic_term'?role==='admin'?'/admin/semesters':`/${role}`:`/${role}`;
    navigate(path);
  }catch(e){setError(e.message);}};
  const savePrefs=async(key,value)=>{const next={...prefs,[key]:value};setPrefs(next);setSaving(true);try{const saved=await apiPut('/notifications/preferences',next);setPrefs(saved);}catch(e){setError(e.message);}finally{setSaving(false);}};
  const savePolicy=async(event)=>{event.preventDefault();setSaving(true);setError('');try{const saved=await apiPut('/notifications/policy',{...policy,
    deadlineReminderDays:String(policy.deadlineReminderDays).split(',').map(n=>Number(n.trim())).filter(Number.isFinite)});setPolicy(saved.policy);}catch(e){setError(e.message);}finally{setSaving(false);}};
  return <Card title="Duty alerts" action={<span className="text-xs text-muted">{unread} unread</span>}>
    {role!=='student'&&<div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      {[['Active alerts',summary?.active],['Critical risks',summary?.critical],['Completion risks',summary?.completionRisks],['Attendance reviews',summary?.discrepancies],['Missed shifts',summary?.missedShifts],['Recovery plans',summary?.recovery],['Transition actions',summary?.transitions]].map(([label,value])=><div key={label} className="rounded-lg bg-canvas p-2.5"><p className="text-[11px] text-muted">{label}</p><p className="mt-0.5 text-lg font-semibold text-ink">{loading&&value==null?'…':value??0}</p></div>)}
    </div>}
    {role==='admin'&&summary?.officeTrends?.length>0&&<div className="mb-3 rounded-lg border border-line">
      <p className="border-b border-line px-3 py-2 text-xs font-semibold text-navy">Alert activity by office · last 30 days</p>
      <ul className="divide-y divide-line">{summary.officeTrends.map(office=><li key={office.officeId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-xs">
        <span className="min-w-0 truncate font-medium text-ink">{office.officeName}</span><span className="whitespace-nowrap text-muted">{office.last30Days} current / {office.prior30Days} prior</span><span className="whitespace-nowrap text-bad-fg">{office.criticalActive} critical</span>
      </li>)}</ul>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter duty alerts">{(role==='student'?studentFilters:oversightFilters).map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} onClick={()=>{resetPages();setFilter(id);}} className={`rounded-full px-3 py-1 text-xs font-medium ${filter===id?'bg-teal text-white':'text-muted hover:bg-canvas'}`}>{label}</button>)}</div>
      <div className="flex gap-3">{role==='student'&&!!unread&&<button type="button" onClick={async()=>{try{await apiPatch('/notifications/read-all',{});setUnread(0);await load();}catch(e){setError(e.message);}}} className="inline-flex items-center gap-1 text-xs font-medium text-teal"><CheckCheck className="h-3.5 w-3.5"/>Mark all read</button>}
        {role==='student'&&<button type="button" onClick={()=>setShowPrefs(v=>!v)} className="inline-flex items-center gap-1 text-xs font-medium text-teal"><Settings2 className="h-3.5 w-3.5"/>Reminder settings</button>}
        {role==='admin'&&<button type="button" onClick={()=>setShowPolicy(v=>!v)} className="inline-flex items-center gap-1 text-xs font-medium text-teal"><Settings2 className="h-3.5 w-3.5"/>Institution alert rules</button>}</div>
    </div>
    {role!=='student'&&<div className="mt-3 grid gap-2 sm:grid-cols-3">
      {role==='admin'&&<label className="text-xs text-muted">Office<select className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink" value={queryFilters.officeId} onChange={e=>{resetPages();setQueryFilters({...queryFilters,officeId:e.target.value});}}><option value="">All offices</option>{officeOptions.map(office=><option key={office.id} value={office.id}>{office.code} · {office.name}</option>)}</select></label>}
      <label className="text-xs text-muted">Category<select className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink" value={queryFilters.category} onChange={e=>{resetPages();setQueryFilters({...queryFilters,category:e.target.value});}}><option value="">All categories</option>{categories.map(category=><option key={category} value={category}>{category.replaceAll('_',' ')}</option>)}</select></label>
      <label className="text-xs text-muted">Status<select className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink" value={queryFilters.status} onChange={e=>{resetPages();setQueryFilters({...queryFilters,status:e.target.value});}}>{['active','resolved','dismissed','all'].map(status=><option key={status} value={status}>{status}</option>)}</select></label>
    </div>}
    {showPrefs&&prefs&&<div className="mt-3 grid gap-2 rounded-lg bg-canvas p-3 text-xs sm:grid-cols-2">
      <label className="flex items-start gap-2"><input type="checkbox" disabled={saving||!prefs.emailAvailable} checked={prefs.emailReminders} onChange={e=>savePrefs('emailReminders',e.target.checked)}/><span>Email alerts for institution-enabled high-priority notices{!prefs.emailAvailable&&<span className="block text-muted">Email is unavailable until SMTP is configured.</span>}</span></label>
      <label className="flex items-start gap-2"><input type="checkbox" disabled={saving} checked={prefs.upcomingShiftReminders} onChange={e=>savePrefs('upcomingShiftReminders',e.target.checked)}/><span>Upcoming approved shift reminders</span></label>
    </div>}
    {showPolicy&&policy&&<form onSubmit={savePolicy} className="mt-3 grid gap-3 rounded-lg bg-canvas p-3 text-xs sm:grid-cols-2">
      <label>Completion risk warning days<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" type="number" min="1" max="180" value={policy.completionRiskWarningDays} onChange={e=>setPolicy({...policy,completionRiskWarningDays:Number(e.target.value)})}/></label>
      <label>Critical risk threshold (days to deadline)<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" type="number" min="0" max="30" value={policy.criticalCompletionRiskDays} onChange={e=>setPolicy({...policy,criticalCompletionRiskDays:Number(e.target.value)})}/></label>
      <label>Deadline reminder days (comma separated)<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={Array.isArray(policy.deadlineReminderDays)?policy.deadlineReminderDays.join(', '):policy.deadlineReminderDays} onChange={e=>setPolicy({...policy,deadlineReminderDays:e.target.value})}/></label>
      <label>Upcoming shift reminder (hours)<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" type="number" min="1" max="168" value={policy.upcomingShiftReminderHours} onChange={e=>setPolicy({...policy,upcomingShiftReminderHours:Number(e.target.value)})}/></label>
      <label>Alert cooldown (hours)<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" type="number" min="1" max="720" value={policy.notificationCooldownHours} onChange={e=>setPolicy({...policy,notificationCooldownHours:Number(e.target.value)})}/></label>
      <label>Escalation timing (hours)<input className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" type="number" min="1" max="720" value={policy.escalationAfterHours} onChange={e=>setPolicy({...policy,escalationAfterHours:Number(e.target.value)})}/></label>
      <label>Email minimum severity<select className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={policy.emailMinimumSeverity} onChange={e=>setPolicy({...policy,emailMinimumSeverity:e.target.value})}>{['informational','warning','critical'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={policy.emailEnabled} onChange={e=>setPolicy({...policy,emailEnabled:e.target.checked})}/>Enable email alerts for opted-in users</label>
      {!policy.emailAvailable&&<p className="text-muted sm:col-span-2">Email delivery is unavailable until SMTP_HOST, SMTP_USER, and SMTP_PASS are configured for the API deployment. In-app alerts continue to work.</p>}
      <div className="sm:col-span-2"><p className="mb-1 font-medium">Enabled alert categories</p><div className="flex flex-wrap gap-2">{['completion_risk','deadline','upcoming_shift','attendance','missed_shift','recovery','transition','schedule_conflict','dtr','absence','compliance','documents','semester_requirement'].map(category=><label key={category} className="flex items-center gap-1"><input type="checkbox" checked={policy.enabledCategories.includes(category)} onChange={e=>setPolicy({...policy,enabledCategories:e.target.checked?[...policy.enabledCategories,category]:policy.enabledCategories.filter(c=>c!==category)})}/>{category.replaceAll('_',' ')}</label>)}</div></div>
      <button disabled={saving} className="justify-self-start rounded-md bg-navy px-3 py-2 font-medium text-white disabled:opacity-50">{saving?'Saving…':'Save institution rules'}</button>
    </form>}
    {error&&<p role="alert" className="mt-3 rounded-md bg-bad-bg p-2 text-xs text-bad-fg">{error}</p>}
    {loading&&items.length===0?<p role="status" className="py-5 text-center text-sm text-muted">Loading duty alerts…</p>:null}
    {!loading&&!error&&items.length===0?<div className="py-5 text-center"><BellRing className="mx-auto h-5 w-5 text-muted"/><p className="mt-2 text-sm font-medium text-ink">You’re all caught up</p><p className="text-xs text-muted">New schedule, attendance, and deadline alerts will appear here.</p></div>:null}
    {!!items.length&&<ul className="mt-3 divide-y divide-line">{items.slice(0,role==='student'?5:items.length).map(item=><li key={item.id}>
      <button type="button" onClick={()=>markRead(item)} className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left hover:bg-canvas">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tone[item.severity]??tone.informational}`}>{item.severity??'informational'}</span>
        <span className="min-w-0 flex-1">{role!=='student'&&<span className="mb-0.5 block text-[10px] text-muted">{[item.recipientName,item.officeName].filter(Boolean).join(' · ')}</span>}<span className="flex flex-wrap items-center gap-1 text-sm font-medium text-ink">{item.title}{!item.readAt&&<span className="h-1.5 w-1.5 rounded-full bg-teal" aria-label="Unread"/>}</span>
          <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted">{item.message}</span><time className="mt-1 block text-[10px] text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></span>
        <span className="shrink-0 self-center text-xs font-medium text-teal">Open</span>
      </button>
    </li>)}</ul>}
    {role!=='student'&&totalAlerts>0&&<nav aria-label="Duty alerts pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <p role="status" className="w-full text-center text-xs text-muted sm:w-auto sm:text-left">Alerts {page*PAGE_SIZE+1} to {page*PAGE_SIZE+items.length} of {totalAlerts}<span className="ml-2">Page {page+1} of {Math.max(1,Math.ceil(totalAlerts/PAGE_SIZE))}</span></p>
      <div className="flex w-full justify-between gap-2 sm:w-auto">
        <button type="button" disabled={page===0||loading} onClick={()=>setPage(page-1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-4 w-4"/>Previous</button>
        <button type="button" disabled={!nextCursor||loading} onClick={()=>{setPageCursors(current=>[...current.slice(0,page+1),nextCursor]);setPage(page+1);}} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight aria-hidden="true" className="h-4 w-4"/></button>
      </div>
    </nav>}
    {role==='student'&&items.length>5&&<p className="mt-2 text-xs text-muted">Showing the latest 5 here. Use the notification bell in the header to browse all alerts.</p>}
  </Card>;
}
