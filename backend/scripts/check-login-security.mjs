// Rollback-only authentication race and lockout regression check; no real accounts changed.
import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {getPool,closePool} from '../src/db/pool.js';import {env} from '../src/config/env.js';
import {hashPassword} from '../src/utils/password.js';import {login} from '../src/modules/auth/auth.service.js';
const db=await getPool().connect();let sequence=0,checks=0;
const transaction=async fn=>{const point=`login_security_${++sequence}`;await db.query(`SAVEPOINT ${point}`);try{const result=await fn(db);await db.query(`RELEASE SAVEPOINT ${point}`);return result;}catch(error){await db.query(`ROLLBACK TO SAVEPOINT ${point}`);await db.query(`RELEASE SAVEPOINT ${point}`);throw error;}};
try{await db.query('BEGIN');const id=crypto.randomUUID(),email=`security-${id}@example.invalid`,password=crypto.randomBytes(24).toString('base64url'),original=await hashPassword(password),replacement=await hashPassword('different-'+password);
 await db.query(`INSERT INTO users(id,email,password_hash,full_name,role,institution_id) VALUES($1,$2,$3,'Rollback maintainer','superadmin',NULL)`,[id,email,original]);
 const options={database:db,transaction};
 const signedIn=await login({email,password},options);assert.equal(signedIn.user.id,id);assert.equal(signedIn.token.length,43);checks++;
 const before=(await db.query('SELECT count(*)::int AS total FROM sessions WHERE user_id=$1',[id])).rows[0].total;
 await assert.rejects(()=>login({email,password},{database:db,transaction:fn=>transaction(async client=>{await client.query('UPDATE users SET password_hash=$2 WHERE id=$1',[id,replacement]);return fn(client);})}),{code:'INVALID_CREDENTIALS'});checks++;
 await assert.rejects(()=>login({email,password},{database:db,transaction:fn=>transaction(async client=>{await client.query(`UPDATE users SET status='disabled' WHERE id=$1`,[id]);return fn(client);})}),{code:'INVALID_CREDENTIALS'});checks++;
 assert.equal((await db.query('SELECT count(*)::int AS total FROM sessions WHERE user_id=$1',[id])).rows[0].total,before);checks++;
 const results=await Promise.allSettled(Array.from({length:env.maxFailedLogins},()=>login({email,password:'not-the-password'},options)));
 assert.ok(results.every(result=>result.status==='rejected'&&result.reason.code==='INVALID_CREDENTIALS'));const {rows:[locked]}=await db.query('SELECT locked_until FROM users WHERE id=$1',[id]);assert.ok(locked.locked_until);checks++;
 await assert.rejects(()=>login({email,password},options),{code:'INVALID_CREDENTIALS'});checks++;
 console.log(JSON.stringify({checks,concurrentFailures:results.length,races:'blocked',accounts:'rolled back'}));
}finally{await db.query('ROLLBACK');db.release();await closePool();}
