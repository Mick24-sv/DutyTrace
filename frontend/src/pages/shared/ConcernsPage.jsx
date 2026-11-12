import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Plus, Send, ArrowLeft, Forward, Pin } from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { useListRefreshRegistry } from '../../components/layout/PullToRefresh.jsx';
import SwipeableInboxRow from '../../components/ui/SwipeableInboxRow.jsx';

const field='mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:ring-2 focus-visible:ring-teal';
const labels={open:'Open',under_review:'Under review',resolved:'Resolved'};
const roleLabel={student:'Student Assistant',supervisor:'Office Supervisor',admin:'Administrator'};
const stamp=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function Status({value}) {return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${value==='resolved'?'bg-ok-bg text-ok-fg':value==='under_review'?'bg-info-bg text-info-fg':'bg-canvas text-muted'}`}>{labels[value]}</span>;}

export default function ConcernsPage(){
 const {user}=useAuth();
 const [params,setParams]=useSearchParams();const id=params.get('id');
 const [compose,setCompose]=useState(Boolean(params.get('recipient')));
 const [list,setList]=useState({items:[],total:0});const [page,setPage]=useState(1);const [status,setStatus]=useState('');
 const [archived,setArchived]=useState(false);
 const inboxPath=`/concerns?page=${page}&archived=${archived}${status?`&status=${status}`:''}`;
 const [detail,setDetail]=useState(null);const [recipients,setRecipients]=useState([]);const [search,setSearch]=useState('');
 const [recipient,setRecipient]=useState(params.get('recipient')||'');const [subject,setSubject]=useState('');const [body,setBody]=useState('');const [reply,setReply]=useState('');
 const [forward,setForward]=useState(false);const [adminId,setAdminId]=useState('');const [forwardNote,setForwardNote]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const [refresh,setRefresh]=useState(0);
 const registerRefresh = useListRefreshRegistry();
 useEffect(() => {
  if (!registerRefresh || id || compose) return undefined;
  let live = true;
  const controller = new AbortController();
  const unregister = registerRefresh(async () => {
   const data = await apiGet(inboxPath, { signal: controller.signal });
   return () => { if (live) { setList(data); setError(''); } };
  });
  return () => { live = false; controller.abort(); unregister(); };
 }, [registerRefresh, id, compose, inboxPath]);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');setDetail(null);
  const path=id?`/concerns/${id}`:inboxPath;
  apiGet(path).then(data=>{if(live){if(id)setDetail(data);else setList(data);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[id,inboxPath,refresh]);
 useEffect(()=>{
  if(!compose&&!forward)return;let live=true;
  const selected=params.get('recipient');
  const timer=setTimeout(()=>apiGet(`/concerns/recipients?search=${encodeURIComponent(search)}${forward?'&role=admin':selected&&!search?`&userId=${encodeURIComponent(selected)}`:''}`).then(data=>{if(live)setRecipients(data.recipients);}).catch(e=>{if(live)setError(e.message);}),250);
  return()=>{live=false;clearTimeout(timer);};
 },[compose,forward,search,params]);
 useEffect(()=>{setReply('');setForward(false);},[id]);
 const act=async(fn)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const open=id=>{setCompose(false);setParams({id});};
 const create=e=>{e.preventDefault();act(async()=>{const data=await apiPost('/concerns',{recipientId:recipient,subject,message:body});setSubject('');setBody('');setRecipient('');open(data.id);});};
 const send=e=>{e.preventDefault();act(async()=>{await apiPost(`/concerns/${id}/replies`,{message:reply});setReply('');setRefresh(v=>v+1);});};
 const staff=user.role!=='student';
 const inboxAction=async(item,action)=>{
  await apiPatch(`/concerns/${item.id}/inbox`,{action});
  setList(current=>{
   if(['archive','unarchive','delete'].includes(action)) return {...current,items:current.items.filter(row=>row.id!==item.id),total:Math.max(0,current.total-1)};
   return {...current,items:current.items.map(row=>row.id===item.id?{...row,pinned:action==='pin'}:row).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.updated_at)-new Date(a.updated_at)||String(a.id).localeCompare(String(b.id)))};
  });
 };
 return <>
  <PageHeader title="Concerns" icon={MessageSquare} description="Send a concern and follow replies in one place.">
   {!compose&&<div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
   {!compose&&!id&&<Button data-tutorial="new-concern" icon={Plus} onClick={()=>{setCompose(true);setRecipient('');setError('');setSearch('');}}>New concern</Button>}
   </div>}
  </PageHeader>
  {(id||compose)&&<Button icon={ArrowLeft} variant="secondary" className="mb-4" disabled={busy} onClick={()=>{setParams({});setCompose(false);setError('');setRefresh(v=>v+1);}}>All concerns</Button>}
  {error&&<p role="alert" className="mb-4 rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
  {compose?<Card title="New concern">
   <form onSubmit={create} className="max-w-2xl space-y-4">
    <p className="text-sm text-muted">Only you and your recipient can read this conversation. Forwarding adds the selected administrator to the conversation.</p>
    <label className="block text-sm">Find recipient<input className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or email" maxLength={100}/></label>
    <label className="block text-sm">Send to<select required value={recipient} onChange={e=>setRecipient(e.target.value)} className={field}><option value="">Choose a recipient</option>{recipients.map(p=><option key={p.id} value={p.id}>{p.full_name} · {roleLabel[p.role]}</option>)}</select></label>
    <p className="text-xs text-muted">Showing up to 50 matching recipients. Search to find someone.</p>
    <label className="block text-sm">Subject<input required minLength={3} maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)} className={field}/></label>
    <label className="block text-sm">Your concern<textarea required minLength={5} maxLength={4000} rows={5} value={body} onChange={e=>setBody(e.target.value)} className={field}/></label>
    <Button type="submit" icon={Send} disabled={busy||!recipient||subject.trim().length<3||body.trim().length<5}>{busy?'Sending…':'Send concern'}</Button>
   </form>
  </Card>:loading?<p role="status" className="text-sm text-muted">Loading concerns…</p>:id&&detail?<>
   <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words text-lg font-semibold text-navy">{detail.item.subject}</h2><Status value={detail.item.status}/></div>
    <p className="mt-2 break-words text-xs text-muted">Participants: {detail.participants.map(p=>`${p.full_name} (${roleLabel[p.role]})`).join(', ')}</p>
    {staff&&<div className="mt-4 flex flex-wrap items-end gap-2">
     <label className="block text-xs text-muted">Status<select aria-label="Concern status" className={field} disabled={busy} value={detail.item.status} onChange={e=>{const status=e.target.value;act(async()=>{await apiPatch(`/concerns/${id}/status`,{status});setRefresh(v=>v+1);});}}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     {user.role==='supervisor'&&detail.item.recipient_id===user.id&&detail.participants.find(p=>p.id===detail.item.sender_id)?.role==='student'&&detail.item.status!=='resolved'&&<Button icon={Forward} variant="secondary" disabled={busy} onClick={()=>{setForward(v=>!v);setSearch('');}}>Forward to admin</Button>}
    </div>}
    {forward&&<form className="mt-4 max-w-xl space-y-3 rounded-lg border border-line p-3" onSubmit={e=>{e.preventDefault();act(async()=>{await apiPost(`/concerns/${id}/forward`,{adminId,message:forwardNote});setForward(false);setForwardNote('');setRefresh(v=>v+1);});}}>
     <p className="text-sm text-muted">The selected admin will see the entire conversation. The student will see that you forwarded it.</p>
     <label className="block text-sm">Administrator<select required className={field} value={adminId} onChange={e=>setAdminId(e.target.value)}><option value="">Choose administrator</option>{recipients.filter(p=>p.role==='admin').map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
     <label className="block text-sm">Reason for forwarding<textarea required minLength={5} maxLength={2000} rows={3} className={field} value={forwardNote} onChange={e=>setForwardNote(e.target.value)}/></label>
     <Button icon={Forward} type="submit" disabled={busy||!adminId||forwardNote.trim().length<5}>Forward concern</Button>
    </form>}
   </Card>
   <Card className="mt-4" title="Conversation">
    {detail.hasMore&&<Button variant="secondary" disabled={busy} onClick={()=>act(async()=>{const older=await apiGet(`/concerns/${id}?before=${encodeURIComponent(detail.messages[0].seq)}`);setDetail(current=>({...current,messages:[...older.messages,...current.messages],hasMore:older.hasMore}));})}>Load earlier messages</Button>}
    <ol className="mt-2 max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1" aria-label="Concern messages">{detail.messages.map(m=><li key={m.id} className={`min-w-0 rounded-lg border border-line p-3 ${m.kind!=='message'?'bg-info-bg/40':m.author_id===user.id?'bg-teal/5':'bg-canvas'}`}>
     <div className="flex flex-wrap justify-between gap-1 text-xs text-muted"><span className="font-medium text-navy">{m.author_name} · {roleLabel[m.author_role]}</span><time dateTime={m.created_at}>{stamp(m.created_at)}</time></div>
     <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">{m.body}</p>
    </li>)}</ol>
    {detail.item.status==='resolved'?<p className="mt-4 text-sm text-muted">This concern is resolved. A staff participant can reopen it if further discussion is needed.</p>:<form onSubmit={send} className="mt-4 border-t border-line pt-4">
     <label className="block text-sm">Reply<textarea required maxLength={4000} rows={3} className={field} value={reply} onChange={e=>setReply(e.target.value)}/></label>
     <Button className="mt-3" type="submit" icon={Send} disabled={busy||!reply.trim()}>{busy?'Sending…':'Send reply'}</Button>
    </form>}
   </Card>
  </>:!id?<>
   <div className="mb-4 flex gap-2" aria-label="Inbox views">{[false,true].map(value=><button key={String(value)} type="button" aria-pressed={archived===value} onClick={()=>{setArchived(value);setPage(1);}} className={`rounded-full px-4 py-2 text-sm ${archived===value?'bg-teal text-white':'bg-surface text-muted'}`}>{value?'Archive':'Inbox'}</button>)}</div>
   <label className="mb-4 block w-48 max-w-full text-sm">Status<select className={field} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All concerns</option>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <Card>{list.items.length===0?<p className="text-sm text-muted">{archived?'No archived concerns.':'No concerns to show. Use New concern to start a conversation.'}</p>:<ul className="divide-y divide-line">{list.items.map(item=><SwipeableInboxRow key={item.id} label={item.subject} pinned={item.pinned} archived={archived} onAction={action=>inboxAction(item,action)}><button type="button" onClick={()=>open(item.id)} className="block w-full rounded-lg p-3 text-left hover:bg-canvas focus-visible:ring-2 focus-visible:ring-teal">
    <div className="flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words font-medium text-teal [overflow-wrap:anywhere]">{item.pinned&&<Pin size={13} className="mr-1 inline" aria-label="Pinned"/>}{item.subject}</span><Status value={item.status}/></div>
    <p className="mt-1 break-words text-xs text-muted">{item.sender_name} → {item.recipient_name}</p><p className="mt-1 text-xs text-muted">Updated {stamp(item.updated_at)}</p>
   </button></SwipeableInboxRow>)}</ul>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"><span className="text-xs text-muted">Page {page}</span><div className="flex gap-2"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="secondary" disabled={page*20>=list.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>
   </Card>
  </>:null}
 </>;
}
