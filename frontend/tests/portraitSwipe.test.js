import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitSwipeDirection } from '../src/utils/portraitSwipe.js';

test('left and right horizontal swipes navigate in opposite directions',()=>{
  assert.equal(portraitSwipeDirection({x:150,y:100},{x:70,y:108}),1);
  assert.equal(portraitSwipeDirection({x:70,y:100},{x:150,y:92}),-1);
});
test('taps, short drags, vertical scrolling and diagonal gestures do not navigate',()=>{
  const start={x:100,y:100};
  for(const end of [{x:100,y:100},{x:130,y:103},{x:105,y:200},{x:160,y:160}])assert.equal(portraitSwipeDirection(start,end),0);
});
