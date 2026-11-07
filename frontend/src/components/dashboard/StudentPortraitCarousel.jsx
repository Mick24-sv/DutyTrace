import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, GraduationCap, Pause, Play, UserRound } from 'lucide-react';
import { apiUrl } from '../../services/api.js';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours } from '../../utils/format.js';
import ProgressBar from '../ui/ProgressBar.jsx';
import { portraitSwipeDirection } from '../../utils/portraitSwipe.js';

function Portrait({student}) {
  const [failed,setFailed]=useState(null);
  return <>
    <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-line via-canvas to-teal/20"><UserRound aria-hidden="true" className="h-16 w-16 text-muted/60" /></span>
    {student.photoUrl&&failed!==student.photoUrl&&<img src={apiUrl(student.photoUrl)} alt="" className="absolute inset-0 h-full w-full object-cover object-top" onError={()=>setFailed(student.photoUrl)}/>}
  </>;
}

export default function StudentPortraitCarousel({students}) {
  const [selectedId,setSelectedId]=useState(null);
  const [playing,setPlaying]=useState(true);
  const [hovered,setHovered]=useState(false);
  const [focused,setFocused]=useState(false);
  const [hidden,setHidden]=useState(false);
  const [reduced,setReduced]=useState(true);
  const [ready,setReady]=useState(false);
  const [touching,setTouching]=useState(false);
  const gesture=useRef(null);
  const suppressClickUntil=useRef(0);
  const found=students.findIndex(s=>s.id===selectedId);
  const index=found<0?0:found;
  const selected=students[index];
  const overview=useApiData(selected?`/users/${selected.id}/student-overview`:null);
  const matchingOverview=overview.data?.student?.id===selected?.id;
  const term=matchingOverview?overview.data.terms?.find(t=>t.isCurrent):null;
  const advancing=playing&&!hovered&&!focused&&!hidden&&!reduced&&!touching&&students.length>1;
  const step=direction=>setSelectedId(students[(index+direction+students.length)%students.length]?.id);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const change=()=>setReduced(media.matches);
    const visibility=()=>setHidden(document.hidden);
    change();visibility();media.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);
    const frame=requestAnimationFrame(()=>setReady(true));
    return()=>{media.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);cancelAnimationFrame(frame);};
  },[]);
  useEffect(()=>{
    if(!advancing)return undefined;
    const timer=setTimeout(()=>setSelectedId(students[(index+1)%students.length].id),7000);
    return()=>clearTimeout(timer);
  },[advancing,index,students]);
  if(!selected)return null;
  const slots=students.length===1?[{student:selected,offset:0}]:students.length===2?
    [{student:students[(index+1)%2],offset:-1},{student:selected,offset:0}]:
    [-1,0,1].map(offset=>({offset,student:students[(index+offset+students.length)%students.length]}));
  return <section aria-label="Student assistant portraits" aria-roledescription="carousel" className="mb-5 min-w-0 rounded-xl border border-line bg-canvas/60 p-3 sm:p-5"
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}
    onKeyDown={e=>{if(e.target.tagName==='BUTTON'&&e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.target.tagName==='BUTTON'&&e.key==='ArrowLeft'){e.preventDefault();step(-1);}}}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><GraduationCap aria-hidden="true" className="h-4 w-4 text-teal"/>Student spotlight</h4><span className="text-xs tabular-nums text-muted">{index+1} of {students.length} on this page</span></div>
    <div className="student-portrait-stage" aria-label="Choose a student"
      onTouchStart={e=>{
        if(students.length<2||e.touches.length!==1){gesture.current=null;setTouching(false);return;}
        const touch=e.touches[0];
        gesture.current={id:touch.identifier,x:touch.clientX,y:touch.clientY};setTouching(true);
      }}
      onTouchMove={e=>{
        const start=gesture.current;
        if(!start)return;
        const touch=Array.from(e.touches).find(t=>t.identifier===start.id);
        if(!touch||e.touches.length!==1||Math.abs(touch.clientY-start.y)>Math.max(12,Math.abs(touch.clientX-start.x))){gesture.current=null;setTouching(false);}
      }}
      onTouchCancel={()=>{gesture.current=null;setTouching(false);}}
      onTouchEnd={e=>{
        const start=gesture.current;gesture.current=null;setTouching(false);
        if(!start)return;
        const touch=Array.from(e.changedTouches).find(t=>t.identifier===start.id);
        if(!touch)return;
        const direction=portraitSwipeDirection(start,{x:touch.clientX,y:touch.clientY});
        if(direction){suppressClickUntil.current=Date.now()+500;step(direction);}
      }}
      onClickCapture={e=>{if(Date.now()<suppressClickUntil.current){e.preventDefault();e.stopPropagation();}}}>
      {slots.map(({student,offset})=><button key={student.id} type="button" aria-pressed={offset===0} aria-label={`Select ${student.fullName}`} onClick={()=>setSelectedId(student.id)}
        className={`student-portrait-card ${offset===0&&ready?'student-portrait-selected':''}`} style={{order:offset+1}}>
        <Portrait student={student}/>
        <span className="absolute inset-0 hidden bg-gradient-to-t from-navy via-navy/10 to-transparent sm:block"/>
        <span className="absolute inset-x-0 bottom-0 hidden p-3 text-left sm:block"><span className="line-clamp-2 block text-xs font-semibold leading-tight text-white">{student.fullName}</span><span className="mt-1 line-clamp-2 block text-[10px] leading-tight text-white/80">{student.office?.name||'No office assigned'}</span></span>
        {offset===0&&advancing&&<span key={selected.id} aria-hidden="true" className="student-portrait-timer absolute bottom-0 left-0 h-0.5 bg-white"/>}
      </button>)}
      {students.length===2&&<span aria-hidden="true" className="student-portrait-card invisible" style={{order:2}}/>}
    </div>
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words text-base font-semibold text-navy">{selected.fullName}</p><p className="mt-1 break-words text-xs text-muted">{[selected.yearLevel?`Year ${selected.yearLevel}`:null,selected.course].filter(Boolean).join(' · ')||'Academic details not provided'}</p><p className="mt-1 break-words text-xs text-muted">{selected.office?.name||'No office assigned'}</p></div>
        <Link to={`/admin/users/${selected.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-teal hover:bg-canvas">View profile<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></Link>
      </div>
      {overview.loading||(!matchingOverview&&!overview.error)?<p role="status" className="mt-3 text-xs text-muted">Loading semester progress…</p>:overview.error?<p role="alert" className="mt-3 text-xs text-bad-fg">Unable to load progress. Open the profile to retry.</p>:term?.requirementAssigned?<div className="mt-3 border-t border-line pt-3"><div className="mb-2 flex flex-wrap justify-between gap-1 text-xs text-muted"><span>{formatHours(term.verifiedHours)} verified of {formatHours(term.requiredHours)}</span><span>{term.completionPercentage??0}% complete</span></div><ProgressBar value={term.verifiedHours} max={term.requiredHours} label="Verified semester progress"/></div>:<p className="mt-3 text-xs text-muted">{term?'No semester requirement assigned.':'No current semester progress available.'}</p>}
    </div>
    {students.length>1&&<div className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={()=>step(-1)} aria-label="Previous student" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface text-teal hover:bg-canvas"><ChevronLeft aria-hidden="true" className="h-4 w-4"/></button>
      <button type="button" onClick={()=>setPlaying(v=>!v)} disabled={reduced} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-teal hover:bg-canvas disabled:opacity-50">{playing&&!reduced?<Pause aria-hidden="true" className="h-4 w-4"/>:<Play aria-hidden="true" className="h-4 w-4"/>}{playing&&!reduced?'Pause slideshow':'Play slideshow'}</button>
      <button type="button" onClick={()=>step(1)} aria-label="Next student" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface text-teal hover:bg-canvas"><ChevronRight aria-hidden="true" className="h-4 w-4"/></button>
    </div>}
  </section>;
}
