import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, makeClient, setupTestServer } from './helpers/testEnv.js';
let fx;
const ctx=setupTestServer({},async()=>{fx=await loadFixtures(api);});
const api=makeClient(ctx);
const as=who=>({cookie:fx.cookies[who]});
test('tutorial starts new for each account and remembers only its own progress',async()=>{
  assert.equal((await api.get('/auth/tutorial')).status,401);
  for(const who of ['studentA','supervisorA','admin']){
    assert.equal((await api.get('/auth/tutorial',as(who))).body.data.progress,null);
    assert.equal((await api.put('/auth/tutorial',{...as(who),body:{stepIndex:2,status:'in_progress'}})).status,200);
    assert.equal((await api.get('/auth/tutorial',as(who))).body.data.progress.stepIndex,2);
    assert.equal((await api.put('/auth/tutorial',{...as(who),body:{stepIndex:5,status:'completed'}})).status,200);
    assert.equal((await api.get('/auth/tutorial',as(who))).body.data.progress.status,'completed');
  }
  assert.equal((await api.get('/auth/tutorial',as('studentA2'))).body.data.progress,null);
  assert.equal((await api.put('/auth/tutorial',{...as('studentA'),body:{stepIndex:0,status:'dismissed',userId:fx.ids.admin}})).status,400);
});
