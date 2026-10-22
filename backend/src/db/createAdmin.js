import { closePool, withTransaction } from './pool.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../utils/password.js';

// Creates (or resets) the FIRST administrator of a fresh database, so you can sign in and create the
// rest of the users and offices in the app. Nothing is hardcoded: you provide the values.
//
//   ADMIN_EMAIL=you@school.edu ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-password' npm run db:create-admin
//
// The password comes from the environment so it is never stored in a file or in shell history by this script.
export async function createAdmin({ email, fullName, password, log = console.log }) {
  if (!email || !fullName || !password) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const passwordHash = await hashPassword(password);
  const institutionName = (process.env.ADMIN_INSTITUTION_NAME ?? 'Default Institution').trim();
  const institutionTimezone = (process.env.ADMIN_INSTITUTION_TIMEZONE ?? process.env.APP_TIMEZONE ?? 'UTC').trim();
  try { new Intl.DateTimeFormat('en', { timeZone: institutionTimezone }); } catch {
    throw new Error('ADMIN_INSTITUTION_TIMEZONE must be a valid IANA timezone.');
  }
  await withTransaction(async (db) => {
    const { rows: [institution] } = await db.query(
      `INSERT INTO institutions (name, timezone) VALUES ($1, $2)
       ON CONFLICT (lower(name)) DO UPDATE SET timezone = EXCLUDED.timezone
       RETURNING id`,
      [institutionName, institutionTimezone],
    );
    await db.query(
      `INSERT INTO institution_dtr_policies (institution_id, required_monthly_hours, updated_by, updated_at)
       SELECT $1, required_monthly_hours, updated_by, updated_at FROM policy_settings
       ON CONFLICT (institution_id) DO NOTHING`,
      [institution.id],
    );
    await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, institution_id)
       VALUES (lower($1), $2, $3, 'admin', $4)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
             role = 'admin', status = 'active', institution_id = EXCLUDED.institution_id,
             failed_login_count = 0, locked_until = NULL`,
      [email.trim(), passwordHash, fullName.trim(), institution.id],
    );
  });
  log(`administrator ${email.trim().toLowerCase()} is ready`);
}

createAdmin({
  email: process.env.ADMIN_EMAIL, fullName: process.env.ADMIN_NAME, password: process.env.ADMIN_PASSWORD,
})
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(closePool);
