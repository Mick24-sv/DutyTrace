import {test} from 'node:test';
import assert from 'node:assert/strict';
import {semesterStatus} from '../src/modules/semesters/semester-status.js';
const base={requiredHours:100,verifiedHours:50,deadline:'2026-12-31',today:'2026-11-06'};
const sessions=[{counted:true,date:'2026-10-30',seconds:8*3600},{counted:true,date:'2026-11-03',seconds:8*3600}];
test('completion, configuration and overdue rules take precedence over attendance pace',()=>{
  assert.equal(semesterStatus({...base,requiredHours:null}),'not_configured');
  assert.equal(semesterStatus({...base,deadline:null}),'not_configured');
  assert.equal(semesterStatus({...base,verifiedHours:100,deadline:null}),'completed');
  assert.equal(semesterStatus({...base,today:'2027-01-01'}),'overdue');
  assert.equal(semesterStatus({...base,today:'2027-01-01',verifiedHours:120}),'completed');
});
test('pace statuses use sufficient recent counted attendance and never verify recorded hours',()=>{
  assert.equal(semesterStatus(base),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions:sessions.slice(0,1)}),'insufficient_data');
  assert.equal(semesterStatus({...base,sessions}),'on_track');
  assert.equal(semesterStatus({...base,sessions,deadline:'2026-11-07'}),'at_risk');
  assert.equal(semesterStatus({...base,sessions:sessions.map(s=>({...s,counted:false}))}),'insufficient_data');
  assert.equal(semesterStatus({...base,verifiedHours:0,requiredHours:10,sessions}),'on_track');
});
test('the status uses the same server-calculated remaining balance as semester progress',()=>{
  assert.equal(semesterStatus({...base,remainingHours:0}),'completed');
  assert.equal(semesterStatus({...base,remainingHours:5,sessions,deadline:'2026-11-08'}),'on_track');
  assert.equal(semesterStatus({...base,remainingHours:50,sessions,deadline:'2026-11-08'}),'at_risk');
  assert.equal(semesterStatus({...base,remainingHours:1,today:'2027-01-01'}),'overdue');
});
test('semester end is the fallback when a separate completion deadline is not set',()=>{
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-12-16',sessions}),'on_track');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-11-05',sessions}),'overdue');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:'2026-12-16'}),'insufficient_data');
  assert.equal(semesterStatus({...base,deadline:null,termEnd:null}),'not_configured');
  assert.equal(semesterStatus({...base,deadline:'2026-11-05',termEnd:'2026-12-16',sessions}),'overdue');
});
