import test from 'node:test';
import assert from 'node:assert/strict';
import { getTutorialProgress, saveTutorialProgress, tutorialProgressSchema, TUTORIAL_VERSION } from '../src/modules/auth/tutorial.service.js';

test('tutorial input rejects forged identity, role, invalid steps and premature completion', () => {
  assert.equal(tutorialProgressSchema.safeParse({stepIndex:5,status:'completed'}).success,true);
  assert.equal(tutorialProgressSchema.safeParse({stepIndex:1,status:'dismissed'}).success,true);
  for (const value of [{stepIndex:0,status:'completed'},{stepIndex:6,status:'in_progress'},{stepIndex:0,status:'unknown'},{stepIndex:0,status:'dismissed',userId:'other'},{stepIndex:0,status:'dismissed',role:'admin'}]) assert.equal(tutorialProgressSchema.safeParse(value).success,false);
});
test('each role reads progress scoped to its authenticated account and tutorial version', async () => {
  for (const role of ['student','supervisor','admin']) {
    const result = await getTutorialProgress({id:'owner',role},{query:async (sql,params) => {
      assert.match(sql,/WHERE user_id=\$1 AND role=\$2 AND version=\$3/);
      assert.deepEqual(params,['owner',role,TUTORIAL_VERSION]);
      return {rows:[]};
    }});
    assert.equal(result.progress,null);
    assert.equal(result.stepCount,6);
  }
});
test('saving progress updates only the authenticated account-role-version key', async () => {
  const input={stepIndex:5,status:'completed'};
  const result=await saveTutorialProgress({id:'owner',role:'student'},input,{query:async (sql,params) => {
    assert.match(sql,/ON CONFLICT\(user_id,role,version\)/);
    assert.deepEqual(params,['owner','student',TUTORIAL_VERSION,5,'completed']);
    return {rows:[input]};
  }});
  assert.deepEqual(result.progress,input);
});
