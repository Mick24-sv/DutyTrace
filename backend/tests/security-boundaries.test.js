import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createApp} from '../src/app.js';
import {env} from '../src/config/env.js';
import {originCheck,requireRole} from '../src/middleware/auth.js';
import {secureSecretEquals,SESSION_TOKEN} from '../src/utils/security.js';
import {hashPassword} from '../src/utils/password.js';
let server,base;
before(async()=>{server=await new Promise(resolve=>{const value=createApp().listen(0,'127.0.0.1',()=>resolve(value));});base=`http://127.0.0.1:${server.address().port}/api`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('private API routes reject anonymous callers before accessing business data',async()=>{
 for(const path of ['/auth/me','/auth/appearance','/users','/offices','/reports/semester-hours','/semesters','/institutions/me','/duty-schedules/mine','/attendance/status','/dtrs/mine','/concerns','/problem-reports/mine','/problem-reports/summary','/platform/institutions','/platform/account','/documents/00000000-0000-4000-8000-000000000000/view']){
  const response=await fetch(base+path);assert.equal(response.status,401,path);assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
test('malformed session cookies cannot crash logout or authentication',async()=>{
 for(const cookie of ['dt_session=garbage','dt_session=j%3A%7B%22bad%22%3Atrue%7D','dt_session='+ 'a'.repeat(300)]) {
  assert.equal((await fetch(`${base}/auth/me`,{headers:{cookie}})).status,401);
  assert.equal((await fetch(`${base}/auth/logout`,{method:'POST',headers:{cookie,origin:env.clientOrigin}})).status,200);
 }
});
test('cross-site mutations and forged origins are rejected',async()=>{
 assert.equal((await fetch(`${base}/auth/logout`,{method:'POST',headers:{origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await fetch(`${base}/auth/logout`,{method:'POST',headers:{'sec-fetch-site':'cross-site'}})).status,403);
 const previous=env.nodeEnv;env.nodeEnv='production';try{let error;originCheck({method:'POST',headers:{},cookies:{[env.sessionCookieName]:'cookie'},get:()=>undefined},{},value=>{error=value;});assert.equal(error.code,'BAD_ORIGIN');}finally{env.nodeEnv=previous;}
});
test('oversized and compressed bodies fail with safe bounded errors',async()=>{
 const compressed=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body:gzipSync(JSON.stringify({password:'do-not-log'}))});
 assert.equal(compressed.status,415);assert.equal((await compressed.json()).error.code,'UNSUPPORTED_ENCODING');
 const huge=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'a'.repeat(110000)})});assert.equal(huge.status,413);
});
test('scheduler endpoints reject missing credentials and do not start jobs',async()=>{
 for(const path of ['/notifications/sweep','/attendance-discrepancies/reconcile'])assert.equal((await fetch(base+path,{method:'POST'})).status,403);
});
test('API responses have anti-sniffing, no-referrer and no-cache controls',async()=>{
 const response=await fetch(`${base}/health`);assert.equal(response.headers.get('x-powered-by'),null);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('permissions-policy'),/microphone=\(\)/);
});
test('privileged roles are explicit and secrets use bounded constant-size comparisons',()=>{
 for(const role of ['student','supervisor','admin']){let error;requireRole('superadmin')({user:{role}},{},value=>{error=value;});assert.equal(error.status,403);}
 assert.equal(secureSecretEquals('a'.repeat(32),'a'.repeat(32)),true);assert.equal(secureSecretEquals('a'.repeat(32),'b'.repeat(32)),false);assert.equal(secureSecretEquals('',undefined),false);assert.equal(secureSecretEquals('a'.repeat(32),'a'.repeat(513)),false);
 assert.equal(SESSION_TOKEN.test('A'.repeat(43)),true);assert.equal(SESSION_TOKEN.test('malformed'),false);
});
test('new passwords cannot silently exceed the bcrypt byte limit',()=>{
 assert.throws(()=>hashPassword('a'.repeat(73)),{code:'PASSWORD_TOO_LONG'});
 assert.throws(()=>hashPassword('🔐'.repeat(19)),{code:'PASSWORD_TOO_LONG'});
});
