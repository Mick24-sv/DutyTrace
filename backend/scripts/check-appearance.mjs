// Rollback-only per-account preference isolation; no real appearance settings changed.
import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {getPool,closePool} from '../src/db/pool.js';import {DUMMY_HASH} from '../src/utils/password.js';
import {getAppearance,saveAppearance,DEFAULT_APPEARANCE} from '../src/modules/auth/appearance.service.js';
const db=await getPool().connect();try{await db.query('BEGIN');const tag=crypto.randomUUID();
 const {rows:[institution]}=await db.query('INSERT INTO institutions(name) VALUES($1) RETURNING id',[`Appearance rollback ${tag}`]);
 const users=[];for(const role of ['student','supervisor','admin','superadmin']){const id=crypto.randomUUID();await db.query('INSERT INTO users(id,email,password_hash,full_name,role,institution_id) VALUES($1,$2,$3,$4,$5,$6)',[id,`${id}@example.invalid`,DUMMY_HASH,'Preference check',role,role==='superadmin'?null:institution.id]);users.push({id,role});}
 for(const user of users)assert.deepEqual((await getAppearance(user,db)).appearance,DEFAULT_APPEARANCE);
 await saveAppearance(users[0],{theme:'dark',accent:'violet',density:'compact'},db);
 assert.deepEqual((await getAppearance(users[0],db)).appearance,{theme:'dark',accent:'violet',density:'compact'});
 for(const user of users.slice(1))assert.deepEqual((await getAppearance(user,db)).appearance,DEFAULT_APPEARANCE);
 await saveAppearance(users[3],{theme:'system',accent:'amber',density:'comfortable'},db);assert.equal((await getAppearance(users[3],db)).appearance.theme,'system');
 const {rows:[access]}=await db.query("SELECT relrowsecurity,has_table_privilege('anon','public.user_appearance_preferences','SELECT,INSERT,UPDATE,DELETE') AS anon_access,has_table_privilege('authenticated','public.user_appearance_preferences','SELECT,INSERT,UPDATE,DELETE') AS client_access FROM pg_class WHERE oid='public.user_appearance_preferences'::regclass");
 assert.equal(access.relrowsecurity,true);assert.equal(access.anon_access,false);assert.equal(access.client_access,false);
 console.log(JSON.stringify({roles:users.length,defaults:'passed',perAccountIsolation:'passed',supabasePublicAccess:'denied',records:'rolled back'}));
}finally{await db.query('ROLLBACK');db.release();await closePool();}
