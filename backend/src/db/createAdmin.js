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
  await withTransaction((db) =>
    db.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES (lower($1), $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
             role = 'admin', status = 'active', failed_login_count = 0, locked_until = NULL`,
      [email.trim(), passwordHash, fullName.trim()],
    ));
  log(`administrator ${email.trim().toLowerCase()} is ready`);
}

createAdmin({
  email: process.env.ADMIN_EMAIL, fullName: process.env.ADMIN_NAME, password: process.env.ADMIN_PASSWORD,
})
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(closePool);
