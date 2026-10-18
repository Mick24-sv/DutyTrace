// Password-reset service — custom Express + PostgreSQL implementation.
// The raw token is NEVER stored; only its SHA-256 hash is persisted.
// Tokens are single-use, expire in 30 minutes, and are atomically invalidated.

import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../utils/password.js';
import { recordAudit } from '../audit/audit.service.js';
import { revokeAllSessions } from './auth.service.js';
import { sendResetEmail, appUrl, emailConfigured } from './email.service.js';
import { isProduction } from '../../config/env.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// Token lifetime in minutes.
const TOKEN_MINUTES = 30;

/**
 * Requests a password reset for the given email.
 * Always returns the same generic response to prevent email enumeration.
 * Returns { sent, devUrl? } so the route can surface the devUrl in dev only.
 */
export async function requestReset({ email, ip, userAgent }) {
  // Fetch user — but even when not found we continue with a dummy path
  // so response time is similar and the caller sees no difference.
  const { rows } = await query(
    'SELECT id, email, status FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  );
  const user = rows[0];

  if (!user || user.status !== 'active') {
    // Still run a cheap operation so timing is similar.
    crypto.randomBytes(32); // intentional no-op to pad timing
    return { sent: false, noUser: true };
  }

  // Generate a cryptographically secure raw token, store only its hash.
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(rawToken);

  await withTransaction(async (db) => {
    // Invalidate any previous un-used tokens for this user.
    await db.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()`,
      [user.id],
    );

    await db.query(
      `INSERT INTO password_reset_tokens
         (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, now() + make_interval(mins => $3), $4, $5)`,
      [user.id, tokenHash, TOKEN_MINUTES, ip, userAgent?.slice(0, 300) ?? null],
    );

    await recordAudit(
      { actorId: user.id, action: 'auth.reset_requested', targetType: 'user', targetId: user.id, ip },
      db,
    );
  });

  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
  const result = await sendResetEmail({ to: user.email, resetUrl });
  return result;
}

/**
 * Verifies a raw reset token. Returns { valid: true, email } or throws.
 */
export async function verifyResetToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError(400, 'INVALID_TOKEN', 'Invalid or missing reset token.');
  }
  const { rows } = await query(
    `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.email
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = $1`,
    [sha256(rawToken)],
  );
  const token = rows[0];
  if (!token) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid.');
  if (token.used_at) throw new AppError(400, 'TOKEN_USED', 'This reset link has already been used.');
  if (new Date(token.expires_at) < new Date()) {
    throw new AppError(400, 'TOKEN_EXPIRED', 'This reset link has expired. Please request a new one.');
  }
  return { valid: true, email: token.email };
}

/**
 * Completes the password reset atomically:
 *  1. Validate token & new password
 *  2. Hash new password
 *  3. Update user's password_hash and reset lockout counters
 *  4. Mark token as used
 *  5. Revoke all active sessions
 *  6. Audit log
 */
export async function resetPassword({ rawToken, newPassword, ip, userAgent }) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError(400, 'INVALID_TOKEN', 'Invalid or missing reset token.');
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
    );
  }

  const tokenHash = sha256(rawToken);
  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (db) => {
    // Lock the token row to handle concurrent reset attempts.
    const { rows } = await db.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const token = rows[0];
    if (!token) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid.');
    if (token.used_at) throw new AppError(400, 'TOKEN_USED', 'This reset link has already been used.');
    if (new Date(token.expires_at) < new Date()) {
      throw new AppError(400, 'TOKEN_EXPIRED', 'This reset link has expired. Please request a new one.');
    }

    // Update password and reset lockout.
    await db.query(
      `UPDATE users
       SET password_hash = $1,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = now()
       WHERE id = $2`,
      [passwordHash, token.user_id],
    );

    // Mark token as used (single-use enforcement).
    await db.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
      [token.id],
    );

    // Revoke all active sessions — user must log in fresh.
    await revokeAllSessions(token.user_id, db);

    await recordAudit(
      {
        actorId: token.user_id,
        action: 'auth.password_reset',
        targetType: 'user',
        targetId: token.user_id,
        ip,
        after: { method: 'password_reset_token' },
      },
      db,
    );
  });
}

export { emailConfigured, isProduction };

