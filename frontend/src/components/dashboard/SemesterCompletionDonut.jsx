import { Link } from 'react-router-dom';

const groups=[
  {key:'completed',label:'Completed',color:'text-ok-fg'},
  {key:'remaining',label:'Still completing',color:'text-teal'},
  {key:'unassigned',label:'No requirement assigned',color:'text-muted'},
];

export default function SemesterCompletionDonut({summary,reportPath,includeUnassigned=false}) {
  const counts={completed:summary.studentsMetRequirement??0,remaining:summary.studentsBelowRequirement??0,unassigned:summary.unassignedRequirements??0};
  const displayed=groups.filter(g=>includeUnassigned||g.key!=='unassigned');
  const total=displayed.reduce((sum,g)=>sum+counts[g.key],0);
  const destination=group=>`${reportPath}?tab=semester-hours&termId=${encodeURIComponent(summary.term.id)}&completion=${group}`;
  let start=0;let elapsed=0;
  const slices=displayed.map(group=>{
    const count=counts[group.key];const fraction=total?count/total*100:0;
    const duration=count?600:0;
    const item={...group,count,fraction,start,delay:elapsed,duration,land:elapsed+duration};
    start+=fraction;elapsed+=duration;
    return item;
  });
  const animationKey=`${summary.term.id}:${includeUnassigned}:${Object.values(counts).join(':')}`;
  return <div key={animationKey} className="mx-auto w-full max-w-2xl">
    <div className="grid min-w-0 justify-items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:justify-items-stretch sm:gap-8">
      <div className="relative h-44 w-44 shrink-0 sm:h-48 sm:w-48">
        <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible" role="group" aria-label="Student semester completion chart">
          <circle cx="60" cy="60" r="48" fill="none" strokeWidth="13" className="stroke-line/60" />
          {slices.filter(s=>s.count>0).map(slice=><Link key={slice.key} to={destination(slice.key)} aria-label={`${slice.label}: ${slice.count} students, ${Math.round(slice.fraction)} percent. View students.`} className={`${slice.color} outline-none [&:focus-visible_circle]:stroke-[17]`}>
            <title>{slice.label}: {slice.count}</title>
            <circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="currentColor" strokeWidth="13" transform={`rotate(${slice.start*3.6-90} 60 60)`} className="semester-donut-arc transition-[stroke-width] hover:stroke-[16]" style={{'--arc':slice.fraction,'--rest':100-slice.fraction,animationDelay:`${slice.delay}ms`,animationDuration:`${slice.duration}ms`}} />
          </Link>)}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center" aria-hidden="true"><span className="text-3xl font-semibold tabular-nums tracking-tight text-navy">{total.toLocaleString()}</span><span className="mt-1 text-xs text-muted">{includeUnassigned?'Assigned students':'With requirements'}</span></div>
      </div>
      <ul className="w-full min-w-0 space-y-2" aria-label="Semester completion groups">
        {slices.map(slice=><li key={slice.key} className="semester-donut-legend" style={{animationDelay:`${slice.land}ms`}}>
          <Link to={destination(slice.key)} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-teal">
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full bg-current ${slice.color}`}/>
            <span className="min-w-0 flex-1 text-sm text-ink">{slice.label}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">{slice.count.toLocaleString()}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{Math.round(slice.fraction)}%</span>
          </Link>
        </li>)}
      </ul>
    </div>
    {!total&&<p className="mt-3 text-center text-sm text-muted">{includeUnassigned?'No student assistants assigned to this office.':'No students have a requirement assigned for this semester.'}</p>}
    {!includeUnassigned&&<Link to={destination('unassigned')} className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm text-muted hover:text-teal"><span>No requirement assigned</span><span className="font-semibold tabular-nums">{counts.unassigned.toLocaleString()}</span></Link>}
  </div>;
}
