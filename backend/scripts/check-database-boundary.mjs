import assert from 'node:assert/strict';
import {getPool,closePool} from '../src/db/pool.js';
const db=await getPool().connect();try{
 const {rows}=await db.query(`SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')`);
 assert.equal(rows.filter(row=>row.anon_access||row.authenticated_access).length,0);assert.equal(rows.filter(row=>!row.relrowsecurity).length,0);
 const {rows:policies}=await db.query("SELECT tablename FROM pg_policies WHERE schemaname='public'");assert.equal(policies.length,0);
 await db.query('BEGIN');for(const role of ['anon','authenticated']){
  await db.query('SAVEPOINT direct_access');await db.query(`SET LOCAL ROLE ${role}`);
  await assert.rejects(()=>db.query('SELECT id FROM public.users LIMIT 1'),{code:'42501'});
  await db.query('ROLLBACK TO SAVEPOINT direct_access');await db.query('RELEASE SAVEPOINT direct_access');
 }
 console.log(JSON.stringify({tablesChecked:rows.length,allRlsEnabled:true,publicClientPrivileges:0,permissivePolicies:0,directUserReads:'denied for anon and authenticated'}));
}finally{await db.query('ROLLBACK').catch(()=>{});db.release();await closePool();}
