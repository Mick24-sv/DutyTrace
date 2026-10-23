import test from 'node:test';
import assert from 'node:assert/strict';
import { findEligibleDiscrepancy } from '../src/utils/discrepancyNavigation.js';

const item = (id, status, originalDetails = {}) => ({ id, status, originalDetails });

test('finds an active discrepancy associated with the selected attendance event', () => {
  const result = findEligibleDiscrepancy([
    item('closed', 'approved_correction', { attendanceEventId: 'event-1' }),
    item('match', 'open', { eventIds: ['event-2'] }),
    item('other', 'under_review', { attendanceEventId: 'event-3' }),
  ], 'event-2');
  assert.equal(result.item.id, 'match');
  assert.equal(result.ambiguous, false);
});

test('returns a single active request when it is the only eligible date match', () => {
  const result = findEligibleDiscrepancy([
    item('done', 'rejected'),
    item('active', 'explanation_submitted'),
  ]);
  assert.equal(result.item.id, 'active');
});

test('distinguishes absent and ambiguous eligible requests', () => {
  assert.deepEqual(findEligibleDiscrepancy([item('done', 'resolved')]), { item: null, ambiguous: false });
  assert.deepEqual(findEligibleDiscrepancy([item('a', 'open'), item('b', 'under_review')]), { item: null, ambiguous: true });
});
