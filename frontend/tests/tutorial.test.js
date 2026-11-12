import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIALS, TUTORIAL_VERSION } from '../src/components/onboarding/tutorialContent.js';
import { tutorialInitialState } from '../src/components/onboarding/tutorialState.js';
import { TUTORIAL_TARGETS, placeTourCard } from '../src/components/onboarding/tutorialTargets.js';
import { TUTORIAL_VERSION as API_VERSION, TUTORIAL_STEP_COUNT } from '../../backend/src/modules/auth/tutorial.service.js';

test('each role has a complete tutorial matching the API version and step limits', () => {
  assert.equal(TUTORIAL_VERSION, API_VERSION);
  for (const [role, tutorial] of Object.entries(TUTORIALS)) {
    assert.equal(tutorial.steps.length, TUTORIAL_STEP_COUNT);
    assert.equal(new Set(tutorial.steps.map(step => step.label)).size, TUTORIAL_STEP_COUNT);
    for (const step of tutorial.steps) {
      assert.ok(step.title && step.description && step.tip);
      assert.equal(step.bullets.length, 3);
      assert.equal(step.preview.rows.length, 3);
      for (const action of step.actions ?? []) assert.ok(action.path.startsWith(`/${role}/`));
    }
  }
});
test('new users open at welcome and unfinished users resume their saved step', () => {
  assert.deepEqual(tutorialInitialState(null,6),{stepIndex:0,open:true});
  assert.deepEqual(tutorialInitialState({status:'in_progress',stepIndex:3},6),{stepIndex:3,open:true});
});
test('completed and dismissed guides stay closed; invalid storage does not hide the guide', () => {
  assert.equal(tutorialInitialState({status:'completed',stepIndex:5},6).open,false);
  assert.equal(tutorialInitialState({status:'dismissed',stepIndex:2},6).open,false);
  assert.equal(tutorialInitialState({status:'unknown'},6).open,true);
  assert.equal(tutorialInitialState({status:'in_progress',stepIndex:999},6).stepIndex,5);
  assert.equal(tutorialInitialState({status:'in_progress',stepIndex:-2},6).stepIndex,0);
});

test('each walkthrough step points to a real control within its own role', () => {
  for (const [role, tutorial] of Object.entries(TUTORIALS)) {
    assert.equal(TUTORIAL_TARGETS[role].length, tutorial.steps.length);
    for (const target of TUTORIAL_TARGETS[role]) {
      assert.ok(target.path === `/${role}` || target.path.startsWith(`/${role}/`));
      assert.ok(target.selector && target.caption && target.detail);
    }
  }
  assert.equal(TUTORIAL_TARGETS.student[2].path, '/student', 'The tour highlights the scanner button without opening the camera.');
});

test('tour cards fit desktop and narrow mobile viewports without covering their target', () => {
  for (const [target, viewport] of [
    [{left:960,top:90,width:120,height:44},{width:1360,height:900}],
    [{left:20,top:88,width:350,height:44},{width:390,height:844}],
    [{left:16,top:88,width:288,height:44},{width:320,height:640}],
  ]) {
    const card = {width:Math.min(382,viewport.width-24),height:600};
    const result = placeTourCard(target,card,viewport);
    const height = Math.min(card.height,result.maxHeight);
    assert.ok(result.left >= 12 && result.left + card.width <= viewport.width-12);
    assert.ok(result.top >= 12 && result.top + height <= viewport.height-12);
    assert.ok(result.left + card.width <= target.left || result.left >= target.left+target.width || result.top+height <= target.top || result.top >= target.top+target.height);
  }
});
