// Read-only schema review. Reports metadata/counts only, never user records or secrets.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {getPool,closePool} from '../src/db/pool.js';
import {env} from '../src/config/env.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sources=[];function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory())walk(full);else if(/\.(js|mjs)$/.test(entry.name))sources.push({file:path.relative(root,full).replaceAll('\\','/'),text:fs.readFileSync(full,'utf8')});}}
walk(path.join(root,'backend/src'));
const db=await getPool().connect();try{
 await db.query('BEGIN READ ONLY');
 const {rows:tables}=await db.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,pg_total_relation_size(c.oid)::bigint::text AS bytes,
   coalesce(s.n_dead_tup,0)::int AS dead_rows_estimate
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') ORDER BY c.relname`);
 const countSql=tables.map(table=>`SELECT '${table.name.replaceAll("'","''")}' AS name,count(*)::int AS rows FROM public."${table.name.replaceAll('"','""')}"`).join(' UNION ALL ');
 const counts=new Map((await db.query(countSql)).rows.map(row=>[row.name,row.rows]));
 for(const table of tables){table.rows=counts.get(table.name);table.sourceFiles=sources.filter(source=>new RegExp(`\\b${table.name}\\b`).test(source.text)).map(source=>source.file);}
 const {rows:indexes}=await db.query(`SELECT t.relname AS table_name,c.relname AS name,i.indisunique AS unique_index,
   i.indisprimary AS primary_index,i.indisvalid AS valid,pg_relation_size(c.oid)::text AS bytes,coalesce(s.idx_scan,0)::text AS scans,
   pg_get_indexdef(c.oid) AS definition,
   concat(i.indrelid,':',i.indisunique,':',i.indkey::text,':',i.indclass::text,':',i.indcollation::text,':',i.indoption::text,':',coalesce(pg_get_expr(i.indexprs,i.indrelid),''),':',coalesce(pg_get_expr(i.indpred,i.indrelid),'')) AS signature,
   EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=c.oid) AS backs_constraint
   FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
   LEFT JOIN pg_stat_user_indexes s ON s.indexrelid=c.oid WHERE n.nspname='public' ORDER BY t.relname,c.relname`);
 const groups=new Map();for(const index of indexes){if(!groups.has(index.signature))groups.set(index.signature,[]);groups.get(index.signature).push(index);}
 const duplicates=[...groups.values()].filter(group=>group.length>1);
 const {rows:constraints}=await db.query(`SELECT c.conname AS name,t.relname AS table_name,c.contype AS type,c.convalidated AS validated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'`);
 const {rows:triggers}=await db.query(`SELECT event_object_table AS table_name,trigger_name,event_manipulation FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name`);
 const {rows:functions}=await db.query(`SELECT p.proname AS name,p.prosecdef AS security_definer,
  (SELECT count(*)::int FROM pg_trigger t WHERE t.tgfoid=p.oid AND NOT t.tgisinternal) AS trigger_references
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY p.proname`);
 const {rows:migrations}=await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name');
 const {rows:views}=await db.query(`SELECT c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname`);
 const {rows:enums}=await db.query(`SELECT t.typname AS name,(SELECT count(*)::int FROM pg_attribute a WHERE a.atttypid=t.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_references FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' ORDER BY t.typname`);
 const migrationFolder=path.join(root,'database/migrations');const local=fs.readdirSync(migrationFolder).filter(name=>/^\d{4}_.+\.sql$/.test(name));
 const missingFiles=migrations.filter(row=>!local.includes(row.name)).map(row=>row.name);
 const changedFiles=migrations.filter(row=>local.includes(row.name)&&crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationFolder,row.name),'utf8')).digest('hex')!==row.checksum).map(row=>row.name);
 const pending=local.filter(name=>!migrations.some(row=>row.name===name));
 const {rows:expired}=await db.query(`SELECT 'sessions' AS kind,count(*)::int AS rows FROM sessions WHERE expires_at<=now() OR revoked_at IS NOT NULL
  UNION ALL SELECT 'password_reset_tokens',count(*)::int FROM password_reset_tokens WHERE expires_at<=now() OR used_at IS NOT NULL
  UNION ALL SELECT 'institution_admin_invitations',count(*)::int FROM institution_admin_invitations WHERE expires_at<=now() OR revoked_at IS NOT NULL OR accepted_at IS NOT NULL
  UNION ALL SELECT 'account_email_changes',count(*)::int FROM account_email_changes WHERE expires_at<=now() OR revoked_at IS NOT NULL OR used_at IS NOT NULL`);
 const {rows:testCandidates}=await db.query(`SELECT 'institutions' AS kind,count(*)::int AS rows FROM institutions WHERE name ILIKE '%rollback%' OR name ILIKE 'DutyTrace verification%'
  UNION ALL SELECT 'users',count(*)::int FROM users WHERE email LIKE '%@example.invalid'
  UNION ALL SELECT 'problem_reports',count(*)::int FROM problem_reports WHERE title ILIKE 'Rollback %'`);
 const {rows:buckets}=await db.query('SELECT id,public FROM storage.buckets ORDER BY id');
 const {rows:storage}=await db.query('SELECT bucket_id,count(*)::int AS objects FROM storage.objects GROUP BY bucket_id');
 const {rows:referenceCounts}=await db.query(`SELECT count(*)::int AS documents,count(*) FILTER(WHERE stored_name IS NOT NULL)::int AS stored_files FROM documents`);
 const {rows:[fileCounts]}=await db.query(`SELECT count(*)::int AS "fileRows",count(DISTINCT d.stored_name)::int AS "distinctFiles",
 count(*) FILTER(WHERE o.id IS NOT NULL)::int AS "presentInBucket",count(*) FILTER(WHERE o.id IS NULL)::int AS "absentFromBucket"
 FROM documents d LEFT JOIN storage.objects o ON o.name=d.stored_name AND o.bucket_id=$1 WHERE d.stored_name IS NOT NULL`,[env.supabaseStorageBucket]);
 const {rows:fileReferences}=await db.query('SELECT stored_name FROM documents WHERE stored_name IS NOT NULL');
 const localPresent=fileReferences.filter(row=>/^[a-f0-9-]{36}$/.test(row.stored_name)&&fs.existsSync(path.join(env.uploadDir,row.stored_name))).length;
 const {rows:[orphans]}=await db.query('SELECT count(*)::int AS objects FROM storage.objects o WHERE o.bucket_id=$1 AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.stored_name=o.name)',[env.supabaseStorageBucket]);
 const storageConsistency={configuredStorage:env.documentStorage,...fileCounts,referencedFilesPresentLocally:localPresent,unreferencedBucketObjects:orphans.objects};
 const result={readOnly:true,tableCount:tables.length,indexCount:indexes.length,migrationCheck:{applied:migrations.length,local:local.length,missingFiles,changedFiles,pending},tables,
  duplicateIndexes:duplicates,invalidIndexes:indexes.filter(row=>!row.valid),unvalidatedConstraints:constraints.filter(row=>!row.validated),
  triggerCount:new Set(triggers.map(row=>`${row.table_name}:${row.trigger_name}`)).size,triggerEventCount:triggers.length,functions,views,enums,
  expiredAuthenticationRows:expired,testDataCandidates:testCandidates,buckets,storageObjects:storage,documentReferences:referenceCounts[0],storageConsistency};
 fs.writeFileSync(path.join(root,'database/schema-review.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({readOnly:true,tables:tables.length,indexes:indexes.length,migrations:result.migrationCheck,emptyTables:tables.filter(table=>!table.rows).map(table=>table.name),noRuntimeReferences:tables.filter(table=>!table.sourceFiles.length).map(table=>table.name),duplicateIndexGroups:duplicates.map(group=>group.map(index=>index.name)),invalidIndexes:result.invalidIndexes.length,unvalidatedConstraints:result.unvalidatedConstraints.length,unattachedFunctions:functions.filter(fn=>!fn.trigger_references).map(fn=>fn.name),expiredAuthenticationRows:expired,testDataCandidates:testCandidates,storageObjects:storage,documentReferences:referenceCounts[0]}));
}finally{await db.query('ROLLBACK');db.release();await closePool();}
