import SemesterStatusBadge from '../../components/attendance/SemesterStatusBadge.jsx';
import {UserRound as UIActionUserRound} from 'lucide-react';
import {useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {Building2,ArrowLeft,CalendarDays,ShieldCheck,Target,Hourglass,ClipboardList,Clock,ChevronDown,ChevronUp,FileText,ArrowUpRight,GraduationCap} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import UserAvatar from '../../components/ui/UserAvatar.jsx';
import {useApiData} from '../../hooks/useApiData.js';
import {formatHours,formatMonth} from '../../utils/format.js';

const termLabel=term=>`${term.academicYear} · ${{first:'First semester',second:'Second semester',summer:'Summer term'}[term.semester]??term.semester}`;

export default function StudentOverviewPage(){
  const {userId}=useParams();
  const {data,loading,error}=useApiData(`/users/${userId}/student-overview`);
  const [termId,setTermId]=useState('');
  const [showAttendance,setShowAttendance]=useState(false);
  const student=data?.student;
  const terms=data?.terms??[];
  const term=terms.find(t=>t.id===termId)??terms.find(t=>t.isCurrent)??terms[0];
  const percent=term?.completionPercentage??0;
  return <>
    <Link to="/admin/users" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-teal"><ArrowLeft className="h-4 w-4"/>Students & Staff</Link>
    <PageHeader icon={UIActionUserRound} title="Student Assistant Overview" description="Profile, office assignment, and verified duty-hour progress.">
      {terms.length>0&&<label className="w-full text-xs text-muted sm:w-auto"><span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4"/>Academic term</span><select value={term?.id??''} onChange={e=>setTermId(e.target.value)} className="mt-1 block min-h-11 w-full max-w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink sm:max-w-xs">{terms.map(t=><option key={t.id} value={t.id}>{termLabel(t)}{t.isCurrent?' (Current)':''}</option>)}</select></label>}
    </PageHeader>
    {loading&&<p role="status" className="text-sm text-muted">Loading student overview…</p>}
    {error&&<p role="alert" className="rounded-lg bg-bad-bg p-4 text-sm text-bad-fg">{error}</p>}
    {student&&<>
      <section className="overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card sm:p-7" aria-label="Student profile and duty-hour progress">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-x-6">
          <div className="flex min-w-0 items-start gap-4">
            <UserAvatar user={student} className="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl"/>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold text-navy sm:text-2xl">{student.fullName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-sm text-muted">Student Assistant</p>
                <Badge tone={student.status==='active'?'approved':'neutral'}>{student.status==='active'?'Active account':'Disabled account'}</Badge>
              </div>
              <p className="mt-2 break-all text-sm text-muted">{student.email}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2 text-sm text-muted md:col-start-1 md:row-start-2"><GraduationCap aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-teal"/><p className="min-w-0 break-words">{[student.yearLevel?`Year ${student.yearLevel}`:null,student.course].filter(Boolean).join(' · ')||'Year level and course not provided yet.'}</p></div>
          <div className="min-w-0 border-t border-line pt-4 md:col-start-2 md:row-span-2 md:row-start-1 md:rounded-xl md:border-0 md:bg-canvas md:p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted md:uppercase md:tracking-wide"><Building2 aria-hidden="true" className="h-4 w-4 shrink-0"/>Assigned office</p>
            <p className="mt-1.5 break-words pl-6 text-sm font-semibold leading-relaxed text-navy md:mt-2 md:pl-0 md:text-xl">{student.office?.name??'No office assigned'}</p>
            <p className="mt-1 pl-6 text-xs leading-relaxed text-muted md:pl-0">{student.office?'Managed by your institution.':'Assign an office under Students & Staff.'}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <div><p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/>Verified semester hours</p><p className="mt-2 break-words text-2xl font-semibold text-navy sm:text-3xl">{term?formatHours(term.verifiedHours):'—'}</p></div>
          <div><p className="flex items-center gap-2 text-xs text-muted"><Target aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/>Required semester hours</p><p className="mt-2 break-words text-2xl font-semibold text-navy sm:text-3xl">{term?.requirementAssigned?formatHours(term.requiredHours):'Not assigned'}</p></div>
          <div className="col-span-2 sm:col-span-1"><p className="flex items-center gap-2 text-xs text-muted"><Hourglass aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/>Remaining hours</p><p className="mt-2 text-2xl font-semibold text-navy sm:text-3xl">{term?.requirementAssigned?formatHours(term.remainingHours):'—'}</p></div>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              {term?.requirementAssigned&&<b className="text-sm text-teal">{percent}% complete</b>}
              <SemesterStatusBadge status={term?.semesterStatus}/>
            </div>
            {term&&<span className="min-w-0 break-words text-xs text-muted sm:text-right sm:text-sm">{termLabel(term)}</span>}
          </div>
          {term?.requirementAssigned?<>
            <div role="progressbar" aria-label="Semester completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,percent))} className="h-3 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-teal" style={{width:`${Math.min(100,Math.max(0,percent))}%`}}/></div>
            <p className="mt-3 text-xs text-muted">Verified hours include approved DTRs, supervisor adjustments, and approved historical credits within this term.</p>
          </>:<p className="text-sm text-muted">{term?'No semester requirement assigned. Set one under Academic Terms.':'No academic terms available for this student.'}</p>}
        </div>
      </section>
      <div className="my-5 flex flex-col gap-2 sm:flex-row"><Link to="/admin/semesters" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-teal"><ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0"/>Manage semester requirements<ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0"/></Link><button type="button" aria-expanded={showAttendance} aria-controls="student-attendance" onClick={()=>setShowAttendance(v=>!v)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-teal"><Clock aria-hidden="true" className="h-4 w-4 shrink-0"/>{showAttendance?'Hide attendance':'View attendance history'}{showAttendance?<ChevronUp aria-hidden="true" className="h-4 w-4"/>:<ChevronDown aria-hidden="true" className="h-4 w-4"/>}</button></div>
      {showAttendance&&<div id="student-attendance" className="mb-5"><AttendanceHistory key={userId} endpoint={`/attendance/users/${userId}`}/></div>}
      <Card title={<span className="flex items-center gap-2"><FileText aria-hidden="true" className="h-4 w-4 text-teal"/>Recent monthly DTRs</span>} action={<span className="text-xs text-muted">Latest 12 records · separate from the term filter</span>}>
        <ul className="max-h-96 divide-y divide-line overflow-y-auto">{data.dtrs.map(dtr=><li key={dtr.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="text-sm font-semibold text-navy">{formatMonth(dtr.month)}</p><p className="mt-1 text-xs text-muted">Recorded: {formatHours(dtr.recordedHours)} · Verified: {dtr.verifiedHours==null?'Awaiting approval':formatHours(dtr.verifiedHours)}</p></div><div className="flex flex-wrap items-center gap-3"><DtrStatusBadge status={dtr.status}/><Link to={`/admin/dtrs/${dtr.id}`} aria-label={`View ${formatMonth(dtr.month)} DTR`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-teal hover:bg-canvas"><FileText aria-hidden="true" className="h-4 w-4"/>View DTR<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></Link></div></li>)}</ul>
        {!data.dtrs.length&&<p className="text-sm text-muted">No monthly DTRs have been created for this student.</p>}
      </Card>
    </>}
  </>;
}
