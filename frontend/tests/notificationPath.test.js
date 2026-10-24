import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationPath } from '../src/utils/notificationPath.js';

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
