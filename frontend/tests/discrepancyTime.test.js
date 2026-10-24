import test from 'node:test';
import assert from 'node:assert/strict';
import { clockOutBounds, discrepancyTimezone, formatDiscrepancyTime } from '../src/utils/discrepancyTime.js';

test('shows the exact shift date and time in the institution timezone', () => {
  assert.equal(formatDiscrepancyTime('2026-10-20T01:00:00Z', 'Asia/Manila'), 'October 20, 2026 at 9:00:00 AM');
  assert.equal(formatDiscrepancyTime('2026-10-19T17:30:00Z', 'Asia/Manila'), 'October 20, 2026 at 1:30:00 AM');
});

test('clock-out uses the shift date and permits the next day for overnight shifts', () => {
  const record = { date: '2026-10-20', timezone: 'Asia/Manila', originalDetails: { scheduledEnd: '2026-10-20T04:00:00Z' } };
  assert.deepEqual(clockOutBounds(record, '2026-10-20T09:00'), { min: '2026-10-20T09:00', max: '2026-10-20T23:59' });
  record.originalDetails.scheduledEnd = '2026-10-20T18:00:00Z';
  assert.equal(clockOutBounds(record).max, '2026-10-21T23:59');
  assert.deepEqual(clockOutBounds({}), { min: undefined, max: undefined });
});

test('uses the institution timezone before snapshot and UTC fallbacks', () => {
  assert.equal(discrepancyTimezone({ timezone: 'Asia/Manila', originalDetails: { timezone: 'UTC' } }), 'Asia/Manila');
  assert.equal(discrepancyTimezone({ originalDetails: { timezone: 'Asia/Manila' } }), 'Asia/Manila');
  assert.equal(discrepancyTimezone({}), 'UTC');
});
