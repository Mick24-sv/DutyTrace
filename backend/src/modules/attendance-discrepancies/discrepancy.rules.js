const MOVES=Object.freeze({
  open:['explanation_submitted','under_review','resolved','cancelled','superseded'],
  explanation_submitted:['open','under_review','approved_correction','rejected','resolved','cancelled','superseded'],
  under_review:['open','explanation_submitted','approved_correction','rejected','resolved','cancelled','superseded'],
  approved_correction:[],rejected:[],resolved:[],cancelled:[],superseded:[],
});

export const canMoveDiscrepancy=(from,to)=>Boolean(MOVES[from]?.includes(to));

export function isWithinShiftTolerance(instant,windows,{earlyMinutes=0,lateMinutes=0,officeId=null}={}){
  const at=new Date(instant).getTime();
  return Number.isFinite(at)&&windows.some(({startsAt,endsAt,officeId:windowOffice})=>{
    if(officeId&&windowOffice&&officeId!==windowOffice)return false;
    const start=new Date(startsAt).getTime(),end=new Date(endsAt).getTime();
    return Number.isFinite(start)&&Number.isFinite(end)&&at>=start-earlyMinutes*60000&&at<=end+lateMinutes*60000;
  });
}

export function sessionsOverlap(a,b){
  return new Date(a.start).getTime()<new Date(b.end).getTime()&&new Date(b.start).getTime()<new Date(a.end).getTime();
}
