import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSchedules, dutyProgress, monthlyVerification, dutyFollowUp } from '../src/utils/dutyOverview.js';

test('schedule search and approval filters work together', () => {
  const rows = [{studentName:'Mick Morales',status:'approved'}, {studentName:'Alex Dasigan',status:'pending_review'}];
  assert.deepEqual(filterSchedules(rows, '  MORALES ', 'approved'), [rows[0]]);
  assert.deepEqual(filterSchedules(rows, 'Mick', 'pending_review'), []);
  assert.deepEqual(filterSchedules(rows, '', ''), rows);
});
test('semester progress uses only provided verified totals and caps its visual percentage', () => {
  assert.deepEqual(dutyProgress({semesterRequirementAssigned:true,semesterRequiredHours:210,semesterVerifiedHours:155,recordedHours:100}), {assigned:true,required:210,verified:155,percentage:74});
  assert.equal(dutyProgress({semesterRequirementAssigned:true,semesterRequiredHours:100,semesterVerifiedHours:125}).percentage, 100);
  assert.equal(dutyProgress({semesterRequirementAssigned:false,semesterRequiredHours:100,semesterVerifiedHours:20}).percentage, null);
  assert.equal(dutyProgress({semesterRequirementAssigned:true,semesterRequiredHours:0}).assigned, false);
});
test('monthly breakdown distinguishes pending QR hours from verified and historical hours', () => {
  const student = {monthlyHours:{'2026-11':31.51},historicalMonthlyHours:{'2026-11':40.5}};
  assert.deepEqual(monthlyVerification(student,'2026-11'), {verified:0,recorded:31.51,historical:40.5,pending:true});
  assert.equal(monthlyVerification({...student,monthlyDtrStatuses:{'2026-11':'approved'}},'2026-11').pending, false);
  assert.equal(monthlyVerification({...student,monthlyVerifiedHours:{'2026-11':54}},'2026-11').verified, 54);
  assert.deepEqual(monthlyVerification(student,'2026-12'), {verified:0,recorded:0,historical:0,pending:false});
});

test('follow-up color follows standing instead of treating every remaining target as overdue', () => {
  const student={semesterRequirementAssigned:true,semesterRequiredHours:210,semesterVerifiedHours:164.01,semesterRemainingHours:45.99,semesterStatus:'on_track'};
  assert.equal(dutyFollowUp(student).tone,'on-track');
  assert.equal(dutyFollowUp(student).remaining,45.99);
  assert.equal(dutyFollowUp({...student,semesterStatus:'at_risk'}).tone,'attention');
  assert.equal(dutyFollowUp({...student,semesterStatus:'overdue'}).tone,'overdue');
  assert.equal(dutyFollowUp({...student,semesterStatus:'insufficient_data'}).tone,'neutral');
  assert.equal(dutyFollowUp({...student,semesterRequirementAssigned:false}).remaining,null);
});
