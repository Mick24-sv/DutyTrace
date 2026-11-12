import test from 'node:test';
import assert from 'node:assert/strict';
import { pullRefreshDistance, PULL_REFRESH_THRESHOLD } from '../src/utils/pullToRefresh.js';

test('upward movement cannot pull the list below its resting position', () => {
  assert.equal(pullRefreshDistance(-100), 0);
  assert.equal(pullRefreshDistance(0), 0);
});

test('pull resistance increases with distance and caps the displacement', () => {
  const first = pullRefreshDistance(100);
  const second = pullRefreshDistance(200);
  const third = pullRefreshDistance(300);
  assert.ok(first < second && second < third);
  assert.ok(third - second < second - first);
  assert.ok(pullRefreshDistance(10000) <= 112);
});

test('a short pull cancels while a deliberate pull reaches the refresh threshold', () => {
  assert.ok(pullRefreshDistance(100) < PULL_REFRESH_THRESHOLD);
  assert.ok(pullRefreshDistance(200) >= PULL_REFRESH_THRESHOLD);
});
