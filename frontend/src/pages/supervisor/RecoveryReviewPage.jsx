import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';

const PAGE_SIZE=7;

export default function RecoveryReviewPage(){
  const [page,setPage]=useState(1);
  const [tick,setTick]=useState(0),[busy,setBusy]=useState(''),[reasons,setReasons]=useState({}),[error,setError]=useState(''),[message,setMessage]=useState('');
  const {data,loading,error:loadError}=useApiData(`/recovery/review?_=${tick}`);
  const plans=data?.plans??[];
  const currentPage=Math.min(page,Math.max(1,Math.ceil(plans.length/PAGE_SIZE)));
  const visiblePlans=plans.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  async function decide(plan,decision){setBusy(plan.id);setError('');try{await apiPost(`/recovery/review/${plan.id}/decision`,{decision,reason:reasons[plan.id]??''});setMessage(`Recovery request ${decision==='approve'?'approved':'rejected'}.`);setTick(n=>n+1);}catch(e){setError(e.message);}finally{setBusy('');}}
  return <><PageHeader title="Recovery Shift Review" description="Review dated recovery requests for your authorized office. Approval rechecks availability and staffing constraints."/>
    {loading&&<p className="text-sm text-muted">Loading recovery requests…</p>}{loadError&&<p role="alert" className="text-sm text-bad-fg">{loadError}</p>}{error&&<p role="alert" className="text-sm text-bad-fg">{error}</p>}{message&&<p role="status" className="mb-3 text-sm text-teal">{message}</p>}
    {data?.plans?.length? <div className="space-y-4">{visiblePlans.map(p=><Card key={p.id}><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{p.studentName}</h2><p className="text-sm text-muted">{p.officeName} · {p.status.replaceAll('_',' ')}</p></div><strong>{p.shifts.reduce((n,s)=>n+s.durationHours,0).toFixed(2)} h</strong></div><ul className="mt-3 space-y-1 text-sm">{p.shifts.map(s=><li key={s.id}>{s.date} · {s.startsAt}–{s.endsAt} · {s.durationHours.toFixed(2)} h · {s.status}</li>)}</ul>{p.status==='pending_review'&&<><label className="mt-3 block text-sm text-muted">Decision note<textarea className="mt-1 block w-full rounded-lg border border-line bg-surface p-2" rows="2" maxLength="1000" value={reasons[p.id]??''} onChange={e=>setReasons(x=>({...x,[p.id]:e.target.value}))}/></label><div className="mt-3 flex gap-2"><Button disabled={busy===p.id} onClick={()=>decide(p,'approve')}>Approve shifts</Button><Button disabled={busy===p.id} onClick={()=>decide(p,'reject')}>Reject</Button></div></>}{p.reviewReason&&<p className="mt-2 text-sm text-muted">Decision: {p.reviewReason}</p>}</Card>)}</div>:data&&!loading&&<Card><p>No recovery requests to review.</p></Card>}
    {data&&<Pagination page={currentPage} total={plans.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading||!!busy} label="Recovery Shift Review pagination" recordLabel="Requests"/>}
  </>;
}
