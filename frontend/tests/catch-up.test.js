import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catchUpEstimate,catchUpIssues} from '../src/utils/catchUp.js';
const days=[{weekday:1,startsAt:'09:00',endsAt:'12:00',afternoonStartsAt:'13:00',afternoonEndsAt:'15:00'}];
const requirement={minimumDailyHours:3,maximumDailyHours:6,maximumWeeklyHours:8,permittedWeekdays:[1,2],permittedTimeWindows:[{startTime:'08:00',endTime:'12:00'},{startTime:'13:00',endTime:'17:00'}]};
test('preview reports the actual gap and subtracts work already recorded today',()=>{
  const basis={days,startsOn:'2026-11-16',endsOn:'2026-11-23',today:'2026-11-16',recordedHoursToday:2,remainingHours:9};
  assert.deepEqual(catchUpEstimate(basis),{capacityHours:8,shortfallHours:1});
  assert.deepEqual(catchUpEstimate({...basis,remainingHours:7}),{capacityHours:8,shortfallHours:0});
});
test('custom preferences check time order, permitted days, windows and hour limits',()=>{
  assert.deepEqual(catchUpIssues(days,requirement),[]);
  assert.ok(catchUpIssues([],requirement).length);
  assert.ok(catchUpIssues([{...days[0],endsAt:'08:00'}],requirement).length);
  assert.ok(catchUpIssues([{...days[0],afternoonStartsAt:'11:00'}],requirement).length);
  assert.ok(catchUpIssues([{...days[0],weekday:3}],requirement).length);
  assert.ok(catchUpIssues([{...days[0],startsAt:'07:00'}],requirement).length);
  assert.ok(catchUpIssues([...days,{...days[0],weekday:2}],requirement).some(issue=>issue.includes('weekly')));
});
