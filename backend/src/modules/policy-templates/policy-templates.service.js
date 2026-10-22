import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';

const fail = (status, code, message) => new AppError(status, code, message);
const termNotFound = () => fail(404, 'NOT_FOUND', 'Academic term not found.');

function mapTemplate(row) {
  return {
    id: row.id, name: row.name, description: row.description, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    latestVersion: row.latest_version_id ? {
      id: row.latest_version_id, version: row.latest_version_number, status: row.latest_version_status,
      reason: row.latest_change_reason, createdAt: row.latest_version_created_at, publishedAt: row.latest_published_at,
    } : null,
  };
}

const TEMPLATE_LIST = `SELECT t.*,
  v.id AS latest_version_id,v.version_number AS latest_version_number,v.status AS latest_version_status,
  v.change_reason AS latest_change_reason,v.created_at AS latest_version_created_at,v.published_at AS latest_published_at
  FROM institution_policy_templates t LEFT JOIN LATERAL (
    SELECT * FROM institution_policy_template_versions x WHERE x.template_id=t.id ORDER BY x.version_number DESC LIMIT 1
  ) v ON true`;

export async function listTemplates(user) {
  const { rows } = await query(`${TEMPLATE_LIST} WHERE t.institution_id=$1 ORDER BY t.updated_at DESC,t.name`, [user.institutionId]);
  return rows.map(mapTemplate);
}

export async function getTemplate(user, templateId) {
  const { rows: [template] } = await query(`${TEMPLATE_LIST} WHERE t.institution_id=$1 AND t.id=$2`, [user.institutionId, templateId]);
  if (!template) throw termNotFound();
  const { rows: versions } = await query(`SELECT id,version_number,status,configuration,change_reason,previous_version_id,
    created_by,published_by,created_at,published_at FROM institution_policy_template_versions
    WHERE institution_id=$1 AND template_id=$2 ORDER BY version_number DESC`, [user.institutionId, templateId]);
  const { rows: assignments } = await query(`SELECT a.id,a.term_id,t.academic_year,t.semester,a.scope_type,a.scope_id,
    CASE a.scope_type WHEN 'institution' THEN i.name WHEN 'office' THEN o.name ELSE student.full_name END AS scope_name,
    a.template_name_snapshot,a.effective_starts_on::text,a.effective_ends_on::text,a.version_id,v.version_number,a.reason,a.applied_at,u.full_name AS applied_by
    FROM institution_policy_assignments a JOIN academic_terms t ON t.id=a.term_id
    JOIN institution_policy_template_versions v ON v.id=a.version_id LEFT JOIN users u ON u.id=a.applied_by
    JOIN institutions i ON i.id=a.institution_id LEFT JOIN offices o ON a.scope_type='office' AND o.id=a.scope_id
    LEFT JOIN users student ON a.scope_type='student' AND student.id=a.scope_id
    WHERE a.institution_id=$1 AND v.template_id=$2 ORDER BY a.applied_at DESC`, [user.institutionId, templateId]);
  return { template: mapTemplate(template), versions, assignments };
}

export async function createTemplate({ user, input, ip }) {
  return withTransaction(async (db) => {
    const { rows: [template] } = await db.query(`INSERT INTO institution_policy_templates
      (institution_id,name,description,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *`,
    [user.institutionId,input.name,input.description,user.id]);
    const { rows: [version] } = await db.query(`INSERT INTO institution_policy_template_versions
      (template_id,institution_id,version_number,configuration,change_reason,created_by)
      VALUES($1,$2,1,$3::jsonb,$4,$5) RETURNING *`,
    [template.id,user.institutionId,JSON.stringify(input.configuration),input.reason,user.id]);
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'policy_template.created',
      targetType:'institution_policy_template',targetId:template.id,after:{name:template.name,version:1},ip},db);
    return { template:mapTemplate({...template,latest_version_id:version.id,latest_version_number:1,latest_version_status:'draft',
      latest_change_reason:version.change_reason,latest_version_created_at:version.created_at}), version };
  });
}

export async function updateTemplate({ user, templateId, input, ip }) {
  return withTransaction(async (db) => {
    const { rows: [template] } = await db.query(`SELECT * FROM institution_policy_templates
      WHERE id=$1 AND institution_id=$2 FOR UPDATE`,[templateId,user.institutionId]);
    if (!template) throw termNotFound();
    if (template.status==='archived') throw fail(409,'TEMPLATE_ARCHIVED','Archived templates cannot be edited. Duplicate it to continue.');
    const { rows: [latest] } = await db.query(`SELECT * FROM institution_policy_template_versions
      WHERE template_id=$1 ORDER BY version_number DESC LIMIT 1 FOR UPDATE`,[templateId]);
    const { rows: [updated] } = await db.query(`UPDATE institution_policy_templates SET name=$3,description=$4,status='draft',updated_by=$5,updated_at=now()
      WHERE id=$1 AND institution_id=$2 RETURNING *`,[templateId,user.institutionId,input.name,input.description,user.id]);
    let version;
    if (latest?.status==='draft') {
      ({rows:[version]}=await db.query(`UPDATE institution_policy_template_versions SET configuration=$2::jsonb,change_reason=$3
        WHERE id=$1 RETURNING *`,[latest.id,JSON.stringify(input.configuration),input.reason]));
    } else {
      ({rows:[version]}=await db.query(`INSERT INTO institution_policy_template_versions
        (template_id,institution_id,version_number,configuration,change_reason,previous_version_id,created_by)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,[templateId,user.institutionId,(latest?.version_number??0)+1,
        JSON.stringify(input.configuration),input.reason,latest?.id??null,user.id]));
    }
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'policy_template.draft_updated',
      targetType:'institution_policy_template_version',targetId:version.id,before:latest?.configuration??null,
      after:{version:version.version_number,configuration:input.configuration,reason:input.reason},ip},db);
    return {template:mapTemplate({...updated,latest_version_id:version.id,latest_version_number:version.version_number,
      latest_version_status:version.status,latest_change_reason:version.change_reason,latest_version_created_at:version.created_at}),version};
  });
}

export async function duplicateTemplate({ user, templateId, input, ip }) {
  const { rows: [source] } = await query(`SELECT t.name,t.description,v.configuration FROM institution_policy_templates t
    JOIN institution_policy_template_versions v ON v.template_id=t.id
    WHERE t.id=$1 AND t.institution_id=$2 AND v.id=$3`,[templateId,user.institutionId,input.versionId]);
  if (!source) throw termNotFound();
  return createTemplate({user,input:{name:input.name,description:input.description??source.description,
    configuration:source.configuration,reason:input.reason},ip});
}

export async function publishVersion({ user, templateId, versionId, ip }) {
  return withTransaction(async (db) => {
    const { rows: [version] } = await db.query(`SELECT v.*,t.name FROM institution_policy_template_versions v
      JOIN institution_policy_templates t ON t.id=v.template_id
      WHERE v.id=$1 AND v.template_id=$2 AND v.institution_id=$3 FOR UPDATE OF v,t`,[versionId,templateId,user.institutionId]);
    if (!version) throw termNotFound();
    if (version.status!=='draft') throw fail(409,'VERSION_NOT_DRAFT','Only a draft policy version can be published.');
    const { rows: [published] } = await db.query(`UPDATE institution_policy_template_versions
      SET status='published',published_by=$2,published_at=now() WHERE id=$1 RETURNING *`,[versionId,user.id]);
    await db.query(`UPDATE institution_policy_templates SET status='active',updated_by=$2,updated_at=now() WHERE id=$1`,[templateId,user.id]);
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'policy_template.version_published',
      targetType:'institution_policy_template_version',targetId:versionId,before:{status:'draft'},
      after:{status:'published',version:published.version_number,reason:published.change_reason},ip},db);
    return {version:published};
  });
}

export async function archiveTemplate({ user, templateId, ip }) {
  return withTransaction(async (db) => {
    const { rows: [template] } = await db.query(`UPDATE institution_policy_templates SET status='archived',updated_by=$3,updated_at=now()
      WHERE id=$1 AND institution_id=$2 AND status<>'archived' RETURNING *`,[templateId,user.institutionId,user.id]);
    if (!template) throw termNotFound();
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'policy_template.archived',
      targetType:'institution_policy_template',targetId:templateId,before:{status:'active_or_draft'},after:{status:'archived'},ip},db);
    return {template:mapTemplate(template)};
  });
}

export async function applyVersion({ user, templateId, versionId, input, ip }) {
  try { return await withTransaction(async (db) => {
    const { rows: [version] } = await db.query(`SELECT v.*,t.name FROM institution_policy_template_versions v
      JOIN institution_policy_templates t ON t.id=v.template_id
      WHERE v.id=$1 AND v.template_id=$2 AND v.institution_id=$3 AND v.status='published'`,
    [versionId,templateId,user.institutionId]);
    if (!version) throw termNotFound();
    const { rows: [term] } = await db.query(`SELECT * FROM academic_terms WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
      [input.termId,user.institutionId]);
    if (!term) throw termNotFound();
    if (term.finalized_at) throw fail(409,'TERM_FINALIZED','A policy cannot be applied to a finalized term.');
    if (input.effectiveStartsOn<term.starts_on||input.effectiveEndsOn>term.ends_on) {
      throw fail(400,'POLICY_DATES_OUTSIDE_TERM','Effective dates must fall within the selected academic term.');
    }
    const scopeId=input.scopeType==='institution'?user.institutionId:input.scopeId;
    if(input.scopeType==='office'){
      const allowed=await db.query('SELECT 1 FROM offices WHERE id=$1 AND institution_id=$2',[scopeId,user.institutionId]);
      if(!allowed.rowCount)throw termNotFound();
    }
    if(input.scopeType==='student'){
      const allowed=await db.query("SELECT 1 FROM users WHERE id=$1 AND institution_id=$2 AND role='student'",[scopeId,user.institutionId]);
      if(!allowed.rowCount)throw termNotFound();
    }
    const {rows:[assignment]}=await db.query(`INSERT INTO institution_policy_assignments
      (institution_id,term_id,scope_type,scope_id,version_id,template_name_snapshot,effective_starts_on,effective_ends_on,configuration_snapshot,reason,applied_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,[user.institutionId,input.termId,input.scopeType,scopeId,versionId,version.name,
      input.effectiveStartsOn,input.effectiveEndsOn,JSON.stringify(version.configuration),input.reason,user.id]);
    const duty=version.configuration.duty;
    if(duty.requiredTermHours!=null&&duty.permittedWeekdays?.length&&duty.permittedTimeWindows?.length){
      await db.query(`INSERT INTO duty_requirement_policies
        (institution_id,term_id,scope_type,scope_id,effective_starts_on,effective_ends_on,required_term_hours,minimum_daily_hours,maximum_daily_hours,maximum_weekly_hours,permitted_weekdays,permitted_time_windows,exception_reason,created_by,updated_by,template_version_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$14,$15)`,[
        user.institutionId,input.termId,input.scopeType,scopeId,input.effectiveStartsOn,input.effectiveEndsOn,
        duty.requiredTermHours,duty.minimumDailyHours,duty.maximumDailyHours,duty.maximumWeeklyHours,duty.permittedWeekdays,
        JSON.stringify(duty.permittedTimeWindows),input.scopeType==='student'?input.reason:null,user.id,versionId]);
    }
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'policy_template.applied',targetType:'institution_policy_assignment',
      targetId:assignment.id,before:null,after:{templateId,versionId,termId:input.termId,scopeType:input.scopeType,scopeId,
        effectiveStartsOn:input.effectiveStartsOn,effectiveEndsOn:input.effectiveEndsOn,reason:input.reason},ip},db);
    return assignment;
  }); } catch(error) {
    if(error.code==='23P01')throw fail(409,'POLICY_ASSIGNMENT_OVERLAP','This scope already has a policy assignment that overlaps those effective dates.');
    if(error.code==='23505')throw fail(409,'POLICY_ASSIGNMENT_CONFLICT','A policy assignment already exists for this scope and date range.');
    throw error;
  }
}

export async function resolveEffectivePolicy({ institutionId,termId,date,officeId=null,studentId=null,db={query} }) {
  const { rows: [term] } = await db.query(`SELECT id,institution_id,starts_on::text,ends_on::text,academic_year,semester,timezone,finalized_at
    FROM academic_terms WHERE id=$1 AND institution_id=$2`,[termId,institutionId]);
  if (!term) throw termNotFound();
  let effectiveDate=date;
  if(!effectiveDate){
    const {rows:[today]}=await db.query(`SELECT (now() AT TIME ZONE $1)::date::text AS today`,[term.timezone]);
    effectiveDate=today.today<term.starts_on?term.starts_on:today.today>term.ends_on?term.ends_on:today.today;
  }
  if(effectiveDate<term.starts_on||effectiveDate>term.ends_on)throw fail(400,'INVALID_EFFECTIVE_DATE','Choose a date within the selected academic term.');
  const scopes=[{type:'institution',id:institutionId},...(officeId?[{type:'office',id:officeId}]:[]),...(studentId?[{type:'student',id:studentId}]:[])];
  const {rows}=await db.query(`SELECT a.id AS assignment_id,a.scope_type,a.scope_id,a.effective_starts_on::text,a.effective_ends_on::text,
    a.configuration_snapshot,a.reason,a.applied_at,a.template_name_snapshot AS template_name,v.id AS version_id,v.version_number
    FROM institution_policy_assignments a JOIN institution_policy_template_versions v ON v.id=a.version_id
    WHERE a.institution_id=$1 AND a.term_id=$2 AND a.effective_starts_on<=$3 AND a.effective_ends_on>=$3
      AND (a.scope_type,a.scope_id) IN (SELECT * FROM unnest($4::text[],$5::uuid[]))
    ORDER BY CASE a.scope_type WHEN 'institution' THEN 1 WHEN 'office' THEN 2 ELSE 3 END,a.applied_at DESC`,
  [institutionId,termId,effectiveDate,scopes.map(s=>s.type),scopes.map(s=>s.id)]);
  const configuration={};const origins={};
  for(const assignment of rows){
    const snapshot=assignment.configuration_snapshot??{};
    for(const [section,values] of Object.entries(snapshot)){
      if(!values||typeof values!=='object'||Array.isArray(values))continue;
      configuration[section]??={};origins[section]??={};
      for(const [key,value] of Object.entries(values)){
        if(value===null||value===undefined)continue;
        configuration[section][key]=value;
        origins[`${section}.${key}`]={scopeType:assignment.scope_type,scopeId:assignment.scope_id,
          templateName:assignment.template_name,version:assignment.version_number,assignmentId:assignment.assignment_id};
      }
    }
  }
  return {term:{id:term.id,academicYear:term.academic_year,semester:term.semester,startsOn:term.starts_on,endsOn:term.ends_on,timezone:term.timezone},
    effectiveDate,configuration,origins,assignments:rows.map(a=>({id:a.assignment_id,scopeType:a.scope_type,scopeId:a.scope_id,
      effectiveStartsOn:a.effective_starts_on,effectiveEndsOn:a.effective_ends_on,reason:a.reason,appliedAt:a.applied_at,
      templateName:a.template_name,versionId:a.version_id,version:a.version_number}))};
}

export async function effectivePolicyForCurrentDate({institutionId,officeId=null,studentId=null,db={query}}){
  const {rows:[term]}=await db.query(`SELECT id,(now() AT TIME ZONE timezone)::date::text AS local_date
    FROM academic_terms WHERE institution_id=$1 AND (now() AT TIME ZONE timezone)::date BETWEEN starts_on AND ends_on
    ORDER BY starts_on DESC LIMIT 1`,[institutionId]);
  if(!term)return null;
  return resolveEffectivePolicy({institutionId,termId:term.id,date:term.local_date,officeId,studentId,db});
}

export async function effectivePolicyForDate({institutionId,date,officeId=null,studentId=null,db={query}}){
  const {rows:[term]}=await db.query(`SELECT id FROM academic_terms WHERE institution_id=$1 AND starts_on<=$2::date AND ends_on>=$2::date
    ORDER BY starts_on DESC LIMIT 1`,[institutionId,date]);
  if(!term)return null;
  return resolveEffectivePolicy({institutionId,termId:term.id,date,officeId,studentId,db});
}

export async function effectivePolicyForUser({ user, termId, date }) {
  const officeId=user.office?.id;
  return resolveEffectivePolicy({institutionId:user.institutionId,termId,date,officeId,
    studentId:user.role==='student'?user.id:null});
}

export async function listTerms(user) {
  const {rows}=await query(`SELECT id,academic_year,semester,starts_on::text,ends_on::text,completion_deadline::text,finalized_at
    FROM academic_terms WHERE institution_id=$1 ORDER BY starts_on DESC`,[user.institutionId]);
  return rows;
}
