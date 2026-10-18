import { query } from '../../db/pool.js';

// Append one row to the audit log. Pass a transaction `db` client to make the
// audit row commit or roll back together with the change it describes.
// NEVER put passwords, hashes, or session tokens in before/after.
export async function recordAudit(
  { actorId = null, action, targetType = null, targetId = null, before = null, after = null, ip = null },
  db = { query },
) {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, before_data, after_data, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId, action, targetType, targetId, before, after, ip],
  );
}
