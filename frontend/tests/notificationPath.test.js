import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPath } from '../src/utils/notificationPath.js';

test('student preference decisions open attendance and personal events keep the selected agenda date',()=>{
  assert.equal(notificationPath('student',{relatedType:'student_duty_schedule',relatedId:'schedule-a'}),'/student/attendance');
  assert.equal(notificationPath('student',{actionUrl:'/student?agendaDate=2026-11-20'}),'/student?agendaDate=2026-11-20');
});

test('supervisor preference alerts open review and agenda reminders preserve their selected date',()=>{
  assert.equal(notificationPath('supervisor',{relatedType:'student_duty_schedule',relatedId:'schedule-1'}),'/supervisor/schedule-review');
  assert.equal(notificationPath('supervisor',{actionUrl:'/supervisor?agendaDate=2026-11-20'}),'/supervisor?agendaDate=2026-11-20');
  assert.equal(notificationPath('supervisor',{relatedType:'historical_duty_credit'}),'/supervisor/historical-hours');
});

test('historical credit alerts open the admin review record without sending students to admin routes', () => {
  assert.equal(notificationPath('admin', {relatedType:'historical_duty_credit',relatedId:'credit-123'}), '/admin/historical-hours?creditId=credit-123');
  assert.equal(notificationPath('student', {relatedType:'historical_duty_credit',relatedId:'credit-123'}), '/student');
  assert.equal(notificationPath('supervisor', {relatedType:'historical_duty_credit'}), '/supervisor/historical-hours');
  assert.equal(notificationPath('admin', {actionUrl:'/admin?agendaDate=2026-11-20'}), '/admin?agendaDate=2026-11-20');
});

test('discrepancy notifications link to the referenced record for each role', () => {
  for (const role of ['student', 'supervisor', 'admin']) {
    assert.equal(notificationPath(role, { relatedType: 'attendance_discrepancy', relatedId: 'record-123' }),
      `/${role}/discrepancies?discrepancyId=record-123`);
  }
});

test('notifications preserve explicit destinations and DTR detail routes', () => {
  assert.equal(notificationPath('supervisor', { actionUrl: '/supervisor/discrepancies?discrepancyId=123' }),
    '/supervisor/discrepancies?discrepancyId=123');
  assert.equal(notificationPath('supervisor', { relatedType: 'monthly_dtr', relatedId: 'dtr-123' }),
    '/supervisor/dtr-review/dtr-123');
});

test('discrepancies without a record ID open the list', () => {
  assert.equal(notificationPath('supervisor', { relatedType: 'attendance_discrepancy' }), '/supervisor/discrepancies');
});
