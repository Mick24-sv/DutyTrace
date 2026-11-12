import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeRelease } from '../src/utils/inboxSwipe.js';

test('short pulls close while directional swipes reveal actions', () => {
  assert.equal(swipeRelease(-35, 360), 'closed');
  assert.equal(swipeRelease(30, 360), 'closed');
  assert.equal(swipeRelease(70, 360), 'left');
  assert.equal(swipeRelease(-130, 360), 'right');
});
test('only a deliberate leftward full swipe deletes', () => {
  assert.equal(swipeRelease(-258, 360), 'right');
  assert.equal(swipeRelease(-260, 360), 'delete');
  assert.equal(swipeRelease(360, 360), 'left');
  assert.equal(swipeRelease(-160, 220), 'right');
  assert.equal(swipeRelease(-181, 220), 'delete');
});
