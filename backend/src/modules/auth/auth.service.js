import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { DUMMY_HASH, verifyPassword } from '../../utils/password.js';
import { recordAudit } from '../audit/audit.service.js';

// Sessions: the browser holds a random token in an httpOnly cookie; the
// database holds only its SHA-256 hash. Role and status are re-read from the
// database on every request, so role changes and account disabling take
// effect immediately.

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const INVALID_LOGIN = () =>
  new AppError(
    401,
    'INVALID_CREDENTIALS',
    'Invalid email or password, or the account is temporarily locked.',
  );

// What the API reveals about a user. Never includes the password hash.
export const toPublicUser = (row) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  status: row.status,
  requiredHours: row.required_hours != null ? Number(row.required_hours) : null,
  institutionId: row.institution_id,
  institution: row.institution_id ? { id: row.institution_id, name: row.institution_name, timezone: row.institution_timezone } : null,
  office: row.office_id ? { id: row.office_id, code: row.office_code, name: row.office_name } : null,
});

// Shared SELECT: a user plus their current office (if any).
export const USER_WITH_OFFICE_SQL = `
  SELECT u.id, u.email, u.full_name, u.role, u.status, u.required_hours,
         i.id AS institution_id, i.name AS institution_name, i.timezone AS institution_timezone,
         o.id AS office_id, o.code AS office_code, o.name AS office_name
  FROM users u
  JOIN institutions i ON i.id = u.institution_id
  LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
  LEFT JOIN offices o ON o.id = d.office_id`;

export async function login({ email, password, ip, userAgent }) {
  const { rows } = await query(
    'SELECT id, password_hash, status, failed_login_count, locked_until, institution_id FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];

  // Always run one bcrypt comparison so response time doesn't reveal whether the email exists.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  const locked = user?.locked_until && user.locked_until > new Date();

  if (!user || user.status !== 'active' || locked || !passwordOk) {
    if (user && user.status === 'active' && !locked && !passwordOk) {
      const failures = user.failed_login_count + 1;
      const lockNow = failures >= env.maxFailedLogins;
      await query(
        `UPDATE users SET failed_login_count = $2,
           locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
         WHERE id = $1`,
        [user.id, lockNow ? 0 : failures, lockNow, env.lockoutMinutes],
      );
      await recordAudit({
        actorId: user.id, institutionId: user.institution_id,
        action: lockNow ? 'auth.account_locked' : 'auth.login_failed',
        targetType: 'user', targetId: user.id, ip,
      });
    } else {
      // Unknown email, disabled or locked account: log without recording what was typed.
      await recordAudit({
        actorId: user?.id ?? null, institutionId: user?.institution_id ?? null,
        action: 'auth.login_rejected',
        targetType: 'user', targetId: user?.id ?? null, ip,
        after: { reason: !user ? 'unknown_email' : locked ? 'locked' : user.status !== 'active' ? 'disabled' : 'bad_password' },
      });
    }
    throw INVALID_LOGIN();
  }

  // Success: new random token every time (prevents session fixation).
  const token = crypto.randomBytes(32).toString('base64url');
  await withTransaction(async (db) => {
    await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
      [user.id, sha256(token), env.sessionHours, ip, userAgent?.slice(0, 300) ?? null],
    );
    await recordAudit({ actorId: user.id, institutionId: user.institution_id, action: 'auth.login', targetType: 'user', targetId: user.id, ip }, db);
  });

  const { rows: full } = await query(`${USER_WITH_OFFICE_SQL} WHERE u.id = $1`, [user.id]);
  return { token, user: toPublicUser(full[0]) };
}

// Returns the logged-in user for a cookie token, or null.
export async function getUserForToken(token) {
  if (!token || typeof token !== 'string') return null;
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status,
            i.id AS institution_id, i.name AS institution_name, i.timezone AS institution_timezone,
            o.id AS office_id, o.code AS office_code, o.name AS office_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN institutions i ON i.id = u.institution_id
     LEFT JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL
     LEFT JOIN offices o ON o.id = d.office_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
    [sha256(token)],
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
}

export async function logout({ token, user, ip }) {
  if (!token) return;
  await query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
  if (user) await recordAudit({ actorId: user.id, institutionId: user.institutionId, action: 'auth.logout', targetType: 'user', targetId: user.id, ip });
}

export async function revokeAllSessions(userId, db = { query }) {
  await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
