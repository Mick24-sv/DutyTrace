import { useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';

export default function RecoveryPlanner({ termId }) {
  const [tick,setTick]=useState(0), [selected,setSelected]=useState([]), [busy,setBusy]=useState(false), [error,setError]=useState(''), [message,setMessage]=useState('');
  const data=useApiData(termId?`/recovery/suggestions?termId=${termId}&_=${tick}`:null);
  const mine=useApiData(`/recovery/mine?_=${tick}`);
  const slots=data.data?.slots??[];
  const selectedSlots=useMemo(()=>slots.filter(s=>selected.includes(`${s.date}|${s.startsAt}|${s.endsAt}`)),[slots,selected]);
  async function submit(){setBusy(true);setError('');setMessage('');try{await apiPost('/recovery',{termId,slots:selectedSlots.map(({date,startsAt,endsAt})=>({date,startsAt,endsAt}))});setSelected([]);setMessage('Recovery request sent to your supervisor for review. These hours are not confirmed or completed.');setTick(x=>x+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function withdraw(id){setBusy(true);try{await apiPost(`/recovery/${id}/withdraw`,{});setTick(x=>x+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Card title="Missed-hours recovery planner">
    {data.loading&&<p className="text-sm text-muted">Finding available recovery times…</p>}{data.error&&<p role="alert" className="text-sm text-bad-fg">{data.error}</p>}
    {data.data&&<>
      <p className="text-sm text-muted">Required <strong>{data.data.forecast?.requiredHours??'—'} h</strong> · Verified <strong>{data.data.forecast?.completedHours??'—'} h</strong> · Remaining <strong>{data.data.remaining??data.data.forecast?.remainingHours??'—'} h</strong> · Deadline <strong>{data.data.forecast?.deadline??'Not configured'}</strong></p>
      <p className="mt-1 text-xs text-muted">{data.data.forecast?.statusLabel}: {data.data.forecast?.reason}</p>
      {slots.length>0?<><div className="mt-3 max-h-64 space-y-2 overflow-auto">{slots.map(s=>{const key=`${s.date}|${s.startsAt}|${s.endsAt}`;return <label key={key} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input type="checkbox" checked={selected.includes(key)} onChange={e=>setSelected(x=>e.target.checked?[...x,key]:x.filter(k=>k!==key))}/><span><strong>{s.date}</strong> · {s.startsAt}–{s.endsAt} · {s.durationHours.toFixed(2)} h</span></label>})}</div>
        <p className="mt-2 text-sm">Selected {selectedSlots.reduce((n,s)=>n+s.durationHours,0).toFixed(2)} h · projected shortfall after selection {Math.max(0,(data.data.remaining??0)-selectedSlots.reduce((n,s)=>n+s.durationHours,0)).toFixed(2)} h</p>
        <Button className="mt-3" disabled={!selected.length||busy} onClick={submit}>Request selected shifts</Button></>:<p className="mt-3 text-sm text-muted">{data.data.reasons?.join(' ')||'No recovery shifts are currently available.'} Remaining shortfall: {data.data.shortfallHours??data.data.remaining??0} h.</p>}
    </>}
    {error&&<p role="alert" className="mt-2 text-sm text-bad-fg">{error}</p>}{message&&<p role="status" className="mt-2 text-sm text-teal">{message}</p>}
    {(mine.data?.plans??[]).length>0&&<div className="mt-4 border-t border-line pt-3"><h3 className="font-medium">My recovery requests</h3><div className="mt-2 space-y-2">{mine.data.plans.map(p=><div key={p.id} className="rounded-lg bg-canvas p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{p.status.replaceAll('_',' ')}</strong>{p.status==='pending_review'&&<Button disabled={busy} onClick={()=>withdraw(p.id)}>Withdraw</Button>}</div><ul className="mt-1">{p.shifts.map(s=><li key={s.id}>{s.date} · {s.startsAt}–{s.endsAt} · {s.durationHours.toFixed(2)} h</li>)}</ul>{p.reviewReason&&<p className="mt-1 text-muted">Supervisor: {p.reviewReason}</p>}</div>)}</div></div>}
  </Card>;
}
