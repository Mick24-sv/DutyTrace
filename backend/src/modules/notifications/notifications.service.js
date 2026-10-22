import { query } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { emailConfigured } from '../auth/email.service.js';

const policyCategories = new Set([
  'completion_risk', 'deadline', 'upcoming_shift', 'attendance', 'missed_shift', 'recovery',
  'transition', 'schedule_conflict', 'dtr', 'absence', 'compliance', 'documents', 'semester_requirement',
]);

export async function createNotification(db, {
  recipientId, institutionId, type, title, message, relatedType = null, relatedId = null,
  important = false, dedupeKey, severity = important ? 'warning' : 'informational', actionUrl = null,
}) {
  const category=type.startsWith('completion')?'completion_risk':type.startsWith('upcoming')?'upcoming_shift':
    type.startsWith('attendance')?'attendance':type.startsWith('semester_deadline')||type.startsWith('semester_assignment')?'deadline':
    type.includes('semester_requirement')?'semester_requirement':
    type.startsWith('semester_transition')?'transition':
    type.startsWith('dtr')?'dtr':type.startsWith('absence')?'absence':type.startsWith('case')?'compliance':
    type.startsWith('document')?'documents':type.startsWith('recovery')?'recovery':
    type.startsWith('schedule_conflict')?'schedule_conflict':type.split('_')[0];
  const riskKey=relatedType==='attendance_discrepancy'&&relatedId?`attendance-discrepancy:${relatedId}`:null;
  const policy=await db.query('SELECT enabled_categories FROM institution_alert_policies WHERE institution_id=$1',[institutionId]);
  if(policyCategories.has(category) && policy.rows[0]?.enabled_categories
    && !policy.rows[0].enabled_categories.includes(category)) return null;
  const { rows } = await db.query(
    `INSERT INTO notifications
       (recipient_id, institution_id, type, title, message, related_type, related_id, important, dedupe_key, severity, action_url, risk_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (recipient_id, dedupe_key) DO NOTHING RETURNING id`,
    [recipientId, institutionId, type, title, message, relatedType, relatedId, important, dedupeKey, severity, actionUrl, riskKey],
  );
  if (rows[0]) {
    await db.query(`INSERT INTO notification_deliveries(notification_id,channel,status)
      VALUES($1,'in_app','sent') ON CONFLICT(notification_id,channel) DO NOTHING`, [rows[0].id]);
    const {rows:[emailRule]}=await db.query(`SELECT p.email_enabled,p.email_minimum_severity,p.enabled_categories,
      COALESCE(n.email_reminders,false) AS email_reminders FROM institution_alert_policies p
      LEFT JOIN notification_preferences n ON n.user_id=$1 AND n.institution_id=$2 WHERE p.institution_id=$2`,[recipientId,institutionId]);
    const rank={informational:1,warning:2,critical:3};
    if(emailRule?.email_enabled&&emailRule.email_reminders&&emailRule.enabled_categories.includes(category)
      &&rank[severity]>=rank[emailRule.email_minimum_severity]) await db.query(`INSERT INTO notification_deliveries(notification_id,channel,status)
        VALUES($1,'email',$2) ON CONFLICT(notification_id,channel) DO NOTHING`,[rows[0].id,emailConfigured()?'pending':'skipped']);
  }
  return rows[0] ?? null;
}

export async function notifyOfficeSupervisors(db, { officeId, institutionId, ...notification }) {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN duty_assignments da ON da.user_id = u.id AND da.ends_on IS NULL
     WHERE u.institution_id = $1 AND u.role = 'supervisor' AND u.status = 'active' AND da.office_id = $2`,
    [institutionId, officeId],
  );
  for (const { id } of rows) {
    await createNotification(db, { recipientId: id, institutionId, ...notification });
  }
}

export async function notifyInstitutionAdmins(db, { institutionId, ...notification }) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE institution_id = $1 AND role = 'admin' AND status = 'active'`,
    [institutionId],
  );
  for (const { id } of rows) {
    await createNotification(db, { recipientId: id, institutionId, ...notification });
  }
}

function mapNotification(row) {
  return {
    id: row.id, recipientId:row.recipient_id, type: row.type, title: row.title, message: row.message,
    relatedType: row.related_type, relatedId: row.related_id, important: row.important,
    createdAt: row.created_at, readAt: row.read_at,
    severity: row.severity ?? (row.important ? 'warning' : 'informational'),
    actionUrl: row.action_url ?? null, resolvedAt: row.resolved_at ?? null,
  };
}

export async function listNotifications(user, filter = 'all', { limit = 50, cursor = null } = {}) {
  if (!['all', 'unread', 'important', 'informational', 'warning', 'critical'].includes(filter)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Choose all, unread, important, informational, warning, or critical notifications.');
  }
  const pageSize=Number(limit);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new AppError(400,'VALIDATION_ERROR','Notification page size must be between 1 and 100.');
  const [list, counts] = await Promise.all([
    query(
      `SELECT id, recipient_id, type, title, message, related_type, related_id, important, created_at, read_at,
              severity, action_url, resolved_at
       FROM notifications WHERE recipient_id = $1 AND institution_id = $2
         AND ($3 = 'all' OR ($3 = 'unread' AND read_at IS NULL) OR ($3 = 'important' AND important)
           OR severity = $3)
         AND ($4::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM notifications WHERE id=$4 AND recipient_id=$1 AND institution_id=$2))
       ORDER BY created_at DESC,id DESC LIMIT $5`,
      [user.id, user.institutionId, filter,cursor,pageSize],
    ),
    query('SELECT count(*)::int AS unread FROM notifications WHERE recipient_id = $1 AND institution_id = $2 AND read_at IS NULL', [user.id, user.institutionId]),
  ]);
  return { notifications: list.rows.map(mapNotification), unreadCount: counts.rows[0].unread,
    nextCursor:list.rows.length===pageSize?list.rows.at(-1).id:null,limit:pageSize };
}

export async function markRead(user, id) {
  const { rows } = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND recipient_id = $2 AND institution_id = $3
     RETURNING id, type, title, message, related_type, related_id, important, created_at, read_at, severity, action_url, resolved_at`,
    [id, user.id, user.institutionId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  return mapNotification(rows[0]);
}

export async function markAllRead(user) {
  const { rowCount } = await query(
    `UPDATE notifications SET read_at = now()
     WHERE recipient_id = $1 AND institution_id = $2 AND read_at IS NULL`,
    [user.id, user.institutionId],
  );
  return { updated: rowCount };
}

export async function deleteNotification(user, id) {
  const { rows } = await query(
    `DELETE FROM notifications
     WHERE id = $1 AND recipient_id = $2 AND institution_id = $3
     RETURNING read_at`,
    [id, user.id, user.institutionId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  return { deleted: true, wasUnread: rows[0].read_at === null };
}

export async function dismissNotification(user,id) {
  const {rows}=await query(`UPDATE notifications SET dismissed_at=COALESCE(dismissed_at,now()),read_at=COALESCE(read_at,now())
    WHERE id=$1 AND recipient_id=$2 AND institution_id=$3 RETURNING id`,[id,user.id,user.institutionId]);
  if(!rows[0]) throw new AppError(404,'NOT_FOUND','Notification not found.');
  return {dismissed:true};
}

export async function listAuthorizedAlerts(actor,{officeId=null,category=null,severity=null,status='active',limit=100,cursor=null}={}){
  if(!['admin','supervisor'].includes(actor.role))throw new AppError(403,'FORBIDDEN','Only office supervisors and administrators can view the authorized alert center.');
  if(!['all','active','resolved','dismissed'].includes(status))throw new AppError(400,'VALIDATION_ERROR','Choose all, active, resolved, or dismissed alerts.');
  if(severity&&!['informational','warning','critical'].includes(severity))throw new AppError(400,'VALIDATION_ERROR','Choose a valid alert severity.');
  const categories=['completion_risk','deadline','upcoming_shift','attendance','missed_shift','recovery','transition','schedule_conflict','dtr','absence','compliance','documents','semester_requirement'];
  if(category&&!categories.includes(category))throw new AppError(400,'VALIDATION_ERROR','Choose a valid alert category.');
  const size=Number(limit);if(!Number.isInteger(size)||size<1||size>200)throw new AppError(400,'VALIDATION_ERROR','Alert page size must be between 1 and 200.');
  const params=[actor.institutionId];const where=['n.institution_id=$1'];
  if(actor.role==='supervisor'){
    params.push(actor.id,actor.office?.id??null);
    where.push(`(n.recipient_id=$2 OR recipient_assignment.office_id=$3 OR related_assignment.office_id=$3)`);
    if(officeId&&officeId!==actor.office?.id)throw new AppError(403,'FORBIDDEN','You may only view alerts for your own office.');
  }
  if(officeId){params.push(officeId);where.push(`COALESCE(recipient_assignment.office_id,related_assignment.office_id)=$${params.length}`);}
  if(category){params.push(category);where.push(`(CASE WHEN n.type LIKE 'completion_risk%' THEN 'completion_risk'
    WHEN n.type LIKE 'upcoming_shift%' THEN 'upcoming_shift' WHEN n.type LIKE 'schedule_conflict%' THEN 'schedule_conflict'
    WHEN n.type LIKE 'recovery%' THEN 'recovery' WHEN n.type LIKE 'semester_transition%' THEN 'transition'
    WHEN n.type LIKE '%semester_requirement%' THEN 'semester_requirement' WHEN n.type LIKE 'dtr%' THEN 'dtr'
    WHEN n.type LIKE 'absence%' THEN 'absence' WHEN n.type LIKE 'case%' THEN 'compliance' WHEN n.type LIKE 'document%' THEN 'documents'
    WHEN n.type LIKE 'attendance%' OR n.type LIKE '%discrepancy%' THEN 'attendance' ELSE 'deadline' END)=$${params.length}`);}
  if(severity){params.push(severity);where.push(`n.severity=$${params.length}`);}
  if(status==='active')where.push('n.resolved_at IS NULL AND n.dismissed_at IS NULL');
  if(status==='resolved')where.push('n.resolved_at IS NOT NULL');
  if(status==='dismissed')where.push('n.dismissed_at IS NOT NULL');
  if(cursor){params.push(cursor);where.push(`(n.created_at,n.id)<(SELECT created_at,id FROM notifications WHERE id=$${params.length} AND institution_id=$1)`);}
  params.push(size);
  const {rows}=await query(`SELECT n.id,n.recipient_id,n.type,n.title,n.message,n.related_type,n.related_id,n.important,n.created_at,n.read_at,n.severity,n.action_url,
      n.resolved_at,n.dismissed_at,u.full_name AS recipient_name,o.name AS office_name,count(*) OVER()::int AS total
    FROM notifications n JOIN users u ON u.id=n.recipient_id
    LEFT JOIN duty_assignments recipient_assignment ON recipient_assignment.user_id=n.recipient_id AND recipient_assignment.ends_on IS NULL
    LEFT JOIN duty_assignments related_assignment ON n.related_type='student' AND related_assignment.user_id=n.related_id AND related_assignment.ends_on IS NULL
    LEFT JOIN offices o ON o.id=COALESCE(recipient_assignment.office_id,related_assignment.office_id)
    WHERE ${where.join(' AND ')} ORDER BY n.created_at DESC,n.id DESC LIMIT $${params.length}`,params);
  const total=rows[0]?.total??0;
  return {alerts:rows.map(r=>({...mapNotification(r),recipientName:r.recipient_name,officeName:r.office_name})),total,
    nextCursor:rows.length===size?rows.at(-1).id:null,limit:size};
}
