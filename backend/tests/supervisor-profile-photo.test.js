import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtures,makeClient,setupTestServer,SAMPLE} from './helpers/testEnv.js';
let fx;
const ctx=setupTestServer({},async()=>{fx=await loadFixtures(api);});
const api=makeClient(ctx);
const as=who=>({cookie:fx.cookies[who]});
test('supervisors manage their own picture and admin can see it without exposing it to other users',async()=>{
 const uploaded=await api.upload('/users/me/photo',SAMPLE.jpeg,{...as('supervisorA'),filename:'portrait.jpg'});
 assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));
 assert.ok(uploaded.body.data.user.photoUrl);
 const path=`/users/${fx.ids.supervisorA}/photo`;
 for(const who of ['supervisorA','admin'])assert.equal((await api.raw('GET',path,as(who))).status,200);
 for(const who of ['studentA','supervisorB'])assert.equal((await api.raw('GET',path,as(who))).status,404);
 assert.equal((await api.upload('/users/me/photo',SAMPLE.pdf,{...as('supervisorA'),filename:'document.pdf'})).status,400);
 assert.equal((await api.request('DELETE','/users/me/photo',as('supervisorA'))).status,200);
 assert.equal((await api.raw('GET',path,as('admin'))).status,404);
});
