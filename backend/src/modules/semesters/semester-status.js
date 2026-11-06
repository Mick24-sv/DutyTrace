// Advisory pace only; this never approves hours or changes requirements.
export function semesterStatus({requiredHours,verifiedHours,remainingHours,deadline,termEnd,today,sessions=[]}) {
  if(requiredHours==null) return 'not_configured';
  const remaining=remainingHours??Math.max(0,Math.round((requiredHours-verifiedHours)*100)/100);
  if(remaining<=0) return 'completed';
  deadline=deadline||termEnd;
  if(!deadline) return 'not_configured';
  if(today>deadline) return 'overdue';
  const dayMs=86400000;
  const todayMs=Date.parse(`${today}T00:00:00Z`);
  const windowStart=new Date(todayMs-27*dayMs).toISOString().slice(0,10);
  const history=sessions.filter(s=>s.counted&&s.seconds>0&&s.date>=windowStart&&s.date<=today);
  const days=[...new Set(history.map(s=>s.date))].sort();
  if(days.length<2) return 'insufficient_data';
  const observedDays=Math.round((todayMs-Date.parse(`${days[0]}T00:00:00Z`))/dayMs)+1;
  if(observedDays<7) return 'insufficient_data';
  const dailyHours=history.reduce((n,s)=>n+s.seconds/3600,0)/observedDays;
  const daysLeft=Math.round((Date.parse(`${deadline}T00:00:00Z`)-todayMs)/dayMs)+1;
  return remaining/dailyHours<=daysLeft?'on_track':'at_risk';
}
