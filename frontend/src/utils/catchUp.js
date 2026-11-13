export const DUTY_WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const minutes = value => Number(value?.slice(0,2))*60+Number(value?.slice(3,5));
export const dutyDayHours = day => (minutes(day.endsAt)-minutes(day.startsAt)+(day.afternoonStartsAt ? minutes(day.afternoonEndsAt)-minutes(day.afternoonStartsAt) : 0))/60;

export function catchUpEstimate({days,startsOn,endsOn,today,recordedHoursToday=0,remainingHours}) {
  let capacity=0;
  const start=[today,startsOn].sort().at(-1);
  for(let date=new Date(`${start}T00:00:00Z`);date<=new Date(`${endsOn}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1)) {
    const day=days.find(day=>day.weekday===((date.getUTCDay()+6)%7)+1);
    if(day) capacity+=Math.max(0,dutyDayHours(day)-(date.toISOString().slice(0,10)===today?recordedHoursToday:0));
  }
  const capacityHours=Math.round(capacity*100)/100;
  return {capacityHours,shortfallHours:Math.max(0,Math.round((remainingHours-capacityHours)*100)/100)};
}

export function catchUpIssues(days, requirement) {
  const issues=[];
  if(!days.length) issues.push('Select at least one duty day.');
  for(const day of days) {
    const label=DUTY_WEEKDAYS[day.weekday-1];
    if(!requirement.permittedWeekdays.includes(day.weekday)) issues.push(`${label} is not permitted by the duty policy.`);
    const periods=[[day.startsAt,day.endsAt],...(day.afternoonStartsAt?[[day.afternoonStartsAt,day.afternoonEndsAt]]:[])];
    if(periods.some(([from,to])=>!from||!to||to<=from) || (day.afternoonStartsAt&&day.endsAt>day.afternoonStartsAt)) {
      issues.push(`${label}: enter ordered, non-overlapping duty times.`); continue;
    }
    const hours=dutyDayHours(day);
    if(hours<requirement.minimumDailyHours) issues.push(`${label}: at least ${requirement.minimumDailyHours} hours are required.`);
    if(requirement.maximumDailyHours!=null&&hours>requirement.maximumDailyHours) issues.push(`${label}: the daily limit is ${requirement.maximumDailyHours} hours.`);
    if(periods.some(([from,to])=>!requirement.permittedTimeWindows.some(window=>from>=window.startTime.slice(0,5)&&to<=window.endTime.slice(0,5)))) issues.push(`${label}: use permitted office time windows.`);
  }
  if(requirement.maximumWeeklyHours!=null&&days.reduce((sum,day)=>sum+dutyDayHours(day),0)>requirement.maximumWeeklyHours) issues.push(`The weekly limit is ${requirement.maximumWeeklyHours} hours.`);
  return issues;
}
