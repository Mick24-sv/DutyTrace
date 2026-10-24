import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../src/utils/format.js';

test('scan timestamps display in Philippine time without changing the recorded instant', () => {
  const recordedAt = '2026-10-24T05:28:24.000Z';
  assert.equal(formatTime(recordedAt, 'Asia/Manila'), '1:28:24 PM');
  assert.equal(formatTime(recordedAt, 'UTC'), '5:28:24 AM');
});
