import {test} from 'node:test';
import assert from 'node:assert/strict';
import {semesterStatus} from '../src/modules/semesters/semester-status.js';
const base={requiredHours:100,verifiedHours:50,deadline:'2026-12-31',today:'2026-11-06'};
const sessions=[{counted:true,date:'2026-10-30',seconds:8*3600},{counted:true,date:'2026-11-03',seconds:8*3600}];
const schedule={startsOn:'2026-07-27',endsOn:'2026-12-16',days:[1,2,3,4].map(weekday=>({weekday,starts_at:'09:00:00',ends_at:'12:00:00',afternoon_starts_at:'13:30:00',afternoon_ends_at:'15:00:00'}))};
test('approved duty days determine capacity, including a Friday off before Monday duty',()=>{
  const progress={requiredHours:210,verifiedHours:164.01,remainingHours:45.99,today:'2026-11-13',deadline:'2026-12-16',schedule};
  assert.equal(semesterStatus(progress),'on_track');
  assert.equal(semesterStatus({...progress,today:'2026-11-14'}),'on_track');
  assert.equal(semesterStatus({...progress,deadline:'2026-11-16'}),'at_risk');
  assert.equal(semesterStatus({...progress,schedule:{...schedule,endsOn:'2026-11-16'}}),'at_risk');
});
test('capacity respects effective start, term end, split shifts and already recorded work today',()=>{
  const progress={...base,today:'2026-11-16',deadline:'2026-11-16',remainingHours:4.5,schedule};
  assert.equal(semesterStatus(progress),'on_track');
  assert.equal(semesterStatus({...progress,remainingHours:4.51}),'at_risk');
  assert.equal(semesterStatus({...progress,sessions:[{counted:true,date:'2026-11-16',seconds:3600}]}),'at_risk');
  assert.equal(semesterStatus({...progress,schedule:{...schedule,startsOn:'2026-11-17'}}),'at_risk');
  assert.equal(semesterStatus({...progress,termEnd:'2026-11-15'}),'at_risk');
  assert.equal(semesterStatus({...progress,remainingHours:0}),'completed');
});
test('completion, configuration and overdue rules take precedence over attendance pace',()=>{
  assert.equal(semesterStatus({...base,requiredHours:null}),'not_configured');
  assert.equal(semesterStatus({...base,deadline:null}),'not_configured');
  assert.equal(semesterStatus({...base,verifiedHours:100,deadline:null}),'completed');
  assert.equal(semesterStatus({...base,today:'2027-01-01'}),'overdue');
  assert.equal(semesterStatus({...base,today:'2027-01-01',verifiedHours:120}),'completed');
});
test('missing approved preferences cannot be replaced by recent attendance averages',()=>{
  assert.equal(semesterStatus(base),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions:sessions.slice(0,1)}),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions}),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions,deadline:'2026-11-07'}),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions:sessions.map(s=>({...s,counted:false}))}),'insufficient_data');
  assert.equal(semesterStatus({...base,verifiedHours:0,requiredHours:10,sessions}),'insufficient_data');
});
test('the status uses the same server-calculated remaining balance as semester progress',()=>{
  assert.equal(semesterStatus({...base,remainingHours:0}),'completed');
  assert.equal(semesterStatus({...base,remainingHours:5,schedule,deadline:'2026-11-10'}),'on_track');
  assert.equal(semesterStatus({...base,remainingHours:50,schedule,deadline:'2026-11-10'}),'at_risk');
  assert.equal(semesterStatus({...base,remainingHours:1,today:'2027-01-01'}),'overdue');
});
test('semester end is the fallback when a separate completion deadline is not set',()=>{
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-12-16',schedule}),'on_track');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-11-05',sessions}),'overdue');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-12-16'}),'insufficient_data');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:null}),'not_configured');
  assert.equal(semesterStatus({...base,deadline:'2026-11-05',termEnd:'2026-12-16',sessions}),'overdue');
});
