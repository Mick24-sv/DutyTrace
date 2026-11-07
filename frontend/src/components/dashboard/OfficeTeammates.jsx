import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowRight, Building2, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import Card from '../ui/Card.jsx';
import UserAvatar from '../ui/UserAvatar.jsx';
import Pagination from '../ui/Pagination.jsx';

export default function OfficeTeammates({preview=false}) {
  const {user}=useAuth();
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  const limit=preview?3:12;
  const {data,loading,error}=useApiData(user.office?`/users/me/teammates?page=${page}&limit=${limit}&search=${encodeURIComponent(query)}`:null);
  if(preview&&(!data?.items?.length||!user.office))return null;
  return <Card className={preview?'mt-6':''} title={<span className="inline-flex items-center gap-2"><Users aria-hidden="true" className="h-4 w-4 text-teal"/>My office teammates</span>} action={preview?<Link to="/student/teammates" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-teal hover:underline">View teammates<ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>:null}>
    {!preview&&<label className="relative mb-4 block max-w-sm"><span className="sr-only">Search teammates by name or course</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/><input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or course" className="min-h-11 w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-base text-ink"/></label>}
    {loading&&<p role="status" className="text-sm text-muted">Loading teammates…</p>}
    {error&&<p role="alert" className="text-sm text-bad-fg">{error}</p>}
    {!user.office&&<p className="text-sm text-muted">Your teammates will appear once you are assigned to an office.</p>}
    {!loading&&!error&&user.office&&!data?.items?.length&&<p className="text-sm text-muted">{query?'No matching teammates.':'No other active student assistants are assigned to your office yet.'}</p>}
    <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{(data?.items??[]).map(teammate=><li key={teammate.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-line p-3">
      <UserAvatar user={teammate} className="h-12 w-12 text-base"/>
      <div className="min-w-0"><p className="break-words text-sm font-semibold text-navy">{teammate.fullName}</p>{!preview&&<><p className="mt-1 break-words text-xs text-muted">{[teammate.yearLevel?`Year ${teammate.yearLevel}`:null,teammate.course].filter(Boolean).join(' · ')||'Academic details not provided'}</p><p className="mt-2 flex items-start gap-1 text-xs text-muted"><Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0 break-words">{teammate.office.name}</span></p></>}</div>
    </li>)}</ul>
    {!preview&&data&&<Pagination page={page} total={data.total} pageSize={limit} onPageChange={setPage} disabled={loading} label="Teammates pagination" recordLabel="Teammates"/>}
  </Card>;
}
