import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtures,makeClient,query,setupTestServer} from './helpers/testEnv.js';
let fx;
const ctx=setupTestServer({},async()=>{fx=await loadFixtures(api);});
const api=makeClient(ctx);
const as=who=>({cookie:fx.cookies[who]});

test('student overview exposes institution-scoped profile and progress only to administrators',async()=>{
  const path=`/users/${fx.ids.studentA}/student-overview`;
  assert.equal((await api.get(path)).status,401);
  assert.equal((await api.get(path,as('studentA'))).status,403);
  assert.equal((await api.get(path,as('supervisorA'))).status,403);
  const result=await api.get(path,as('admin'));
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.data.student.id,fx.ids.studentA);
  assert.equal(result.body.data.student.office.id,fx.officeIds.A);
  assert.ok(Array.isArray(result.body.data.terms));
  assert.ok(Array.isArray(result.body.data.dtrs));
  assert.ok(!('passwordHash' in result.body.data.student));
  assert.equal((await api.get(`/users/${fx.ids.supervisorA}/student-overview`,as('admin'))).status,404);
  const {rows:[institution]}=await query("INSERT INTO institutions(name,timezone) VALUES('Overview isolation','UTC') RETURNING id");
  const {rows:[foreign]}=await query(`INSERT INTO users(email,password_hash,full_name,role,institution_id)
    SELECT 'overview-isolated@example.test',password_hash,'Other institution student','student',$1 FROM users WHERE id=$2 RETURNING id`,[institution.id,fx.ids.studentA]);
  assert.equal((await api.get(`/users/${foreign.id}/student-overview`,as('admin'))).status,404);
});
