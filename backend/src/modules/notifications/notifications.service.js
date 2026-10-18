import { query } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';

export async function createNotification(db, {
  recipientId, institutionId, type, title, message, relatedType = null, relatedId = null,
  important = false, dedupeKey,
}) {
  await db.query(
    `INSERT INTO notifications
       (recipient_id, institution_id, type, title, message, related_type, related_id, important, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (recipient_id, dedupe_key) DO NOTHING`,
    [recipientId, institutionId, type, title, message, relatedType, relatedId, important, dedupeKey],
  );
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
    id: row.id, type: row.type, title: row.title, message: row.message,
    relatedType: row.related_type, relatedId: row.related_id, important: row.important,
    createdAt: row.created_at, readAt: row.read_at,
  };
}

export async function listNotifications(user, filter = 'all') {
  if (!['all', 'unread', 'important'].includes(filter)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Choose all, unread, or important notifications.');
  }
  const [list, counts] = await Promise.all([
    query(
      `SELECT id, type, title, message, related_type, related_id, important, created_at, read_at
       FROM notifications WHERE recipient_id = $1 AND institution_id = $2
         AND ($3 = 'all' OR ($3 = 'unread' AND read_at IS NULL) OR ($3 = 'important' AND important))
       ORDER BY created_at DESC LIMIT 100`,
      [user.id, user.institutionId, filter],
    ),
    query('SELECT count(*)::int AS unread FROM notifications WHERE recipient_id = $1 AND institution_id = $2 AND read_at IS NULL', [user.id, user.institutionId]),
  ]);
  return { notifications: list.rows.map(mapNotification), unreadCount: counts.rows[0].unread };
}

export async function markRead(user, id) {
  const { rows } = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND recipient_id = $2 AND institution_id = $3
     RETURNING id, type, title, message, related_type, related_id, important, created_at, read_at`,
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
