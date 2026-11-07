import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures,makeClient,setupTestServer,query } from './helpers/testEnv.js';
let fx;
const ctx=setupTestServer({},async()=>{fx=await loadFixtures(api);});
const api=makeClient(ctx);
const as=who=>({cookie:fx.cookies[who]});
const post=(path,who,body)=>api.post(path,{...as(who),body});

test('recipient scope, private replies, forwarding, statuses and notifications',async()=>{
 const recipients=await api.get('/concerns/recipients',as('studentA'));
 assert.equal(recipients.status,200);
 assert.ok(recipients.body.data.recipients.some(p=>p.id===fx.ids.supervisorA));
 assert.ok(!recipients.body.data.recipients.some(p=>p.id===fx.ids.supervisorB||p.id===fx.ids.studentA2));
 for(const recipientId of [fx.ids.studentA2,fx.ids.supervisorB]) assert.equal((await post('/concerns','studentA',{recipientId,subject:'Private concern',message:'Please help with my assignment.'})).status,403);
 assert.equal((await post('/concerns','supervisorA',{recipientId:fx.ids.studentB,subject:'Office concern',message:'Please check the assignment.'})).status,403);
 const created=await post('/concerns','studentA',{recipientId:fx.ids.supervisorA,subject:'Office assignment question',message:'Can you help with my duty assignment?'});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.data.id;const path=`/concerns/${id}`;
 for(const who of ['admin','supervisorB','studentA2']){
  assert.equal((await api.get(path,as(who))).status,403);
  assert.equal((await post(`${path}/replies`,who,{message:'Unauthorized reply'})).status,403);
  assert.ok(!(await api.get('/concerns',as(who))).body.data.items.some(p=>p.id===id));
 }
 assert.equal((await post(`${path}/replies`,'supervisorA',{message:'I will check your assignment.'})).status,200);
 assert.equal((await post(`${path}/forward`,'studentA',{adminId:fx.ids.admin,message:'Please forward this.'})).status,403);
 assert.equal((await post(`${path}/forward`,'supervisorA',{adminId:fx.ids.admin,message:'Please review this assignment concern.'})).status,200);
 const forwarded=await api.get(path,as('admin'));
 assert.equal(forwarded.status,200);
 assert.equal(forwarded.body.data.participants.length,3);
 assert.ok((await api.get(path,as('studentA'))).body.data.messages.some(m=>m.kind==='forward'));
 assert.equal((await post(`${path}/replies`,'admin',{message:'I will review this concern.'})).status,200);
 assert.equal((await api.request('PATCH',`${path}/status`,{...as('studentA'),body:{status:'resolved'}})).status,403);
 assert.equal((await api.request('PATCH',`${path}/status`,{...as('admin'),body:{status:'resolved'}})).status,200);
 assert.equal((await post(`${path}/replies`,'studentA',{message:'Another reply'})).status,409);
 assert.equal((await api.request('PATCH',`${path}/status`,{...as('admin'),body:{status:'open'}})).status,200);
 assert.equal((await post(`${path}/replies`,'studentA',{message:'Thank you for reopening.'})).status,200);
 const notifications=await api.get('/notifications',as('studentA'));
 assert.ok(notifications.body.data.notifications.some(n=>n.type==='concern_updated'));
 const supervisorConcern=await post('/concerns','supervisorA',{recipientId:fx.ids.admin,subject:'Supervisor concern',message:'Please review our office concern.'});
 assert.equal(supervisorConcern.status,201);
 assert.equal((await api.get(`/concerns/${supervisorConcern.body.data.id}`,as('studentA'))).status,403);
});

test('message pagination keeps all messages even with identical timestamps',async()=>{
 const created=await post('/concerns','admin',{recipientId:fx.ids.studentA,subject:'Pagination check',message:'Initial message for checking pagination.'});
 const id=created.body.data.id;
 await query(`INSERT INTO concern_messages(concern_id,author_id,body,created_at)
 SELECT $1,$2,'Message '||n,'2026-01-01T00:00:00Z' FROM generate_series(1,65) n`,[id,fx.ids.admin]);
 const first=(await api.get(`/concerns/${id}`,as('studentA'))).body.data;
 assert.equal(first.messages.length,50);assert.equal(first.hasMore,true);
 const second=(await api.get(`/concerns/${id}?before=${first.messages[0].seq}`,as('studentA'))).body.data;
 assert.equal(second.messages.length,16);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.messages,...second.messages].map(m=>m.id)).size,66);
});
