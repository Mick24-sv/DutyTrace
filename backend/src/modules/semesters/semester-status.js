export function scheduledCapacity({today,deadline,termEnd,schedule,sessions=[]}) {
  if (!schedule?.days?.length) return null;
  const start = [today, schedule.startsOn].filter(Boolean).sort().at(-1);
  const end = [deadline, termEnd, schedule.endsOn].filter(Boolean).sort()[0];
  const minutes = value => {
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
  };
  let capacity = 0;
  for(let date = new Date(`${start}T00:00:00Z`); date <= new Date(`${end}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+1)) {
    const weekday = ((date.getUTCDay()+6)%7)+1;
    const day = schedule.days.find(day => Number(day.weekday) === weekday);
    if(!day) continue;
    let hours = 0;
    for(const [from,to] of [[day.starts_at,day.ends_at],[day.afternoon_starts_at,day.afternoon_ends_at]]) {
      if(from && to) hours += Math.max(0,minutes(to)-minutes(from))/60;
    }
    if(date.toISOString().slice(0,10) === today) {
      hours = Math.max(0,hours-sessions.filter(s=>s.counted&&s.date===today).reduce((sum,s)=>sum+s.seconds/3600,0));
    }
    capacity += hours;
  }
  return Math.round(capacity*100)/100;
}

// Schedule-based projection only; this never approves hours or changes requirements.
export function semesterStatus({requiredHours,verifiedHours,remainingHours,deadline,termEnd,today,sessions=[],schedule}) {
  if(requiredHours==null) return 'not_configured';
  const remaining=remainingHours??Math.max(0,Math.round((requiredHours-verifiedHours)*100)/100);
  if(remaining<=0) return 'completed';
  deadline=deadline||termEnd;
  if(!deadline) return 'not_configured';
  if(today>deadline) return 'overdue';
  if(schedule?.days?.length) {
    const capacity = scheduledCapacity({today,deadline,termEnd,schedule,sessions});
    return Math.round(capacity*100) >= Math.round(remaining*100) ? 'on_track' : 'at_risk';
  }
  // Without approved preferences, attendance averages cannot establish future duty capacity.
  return 'insufficient_data';
}
