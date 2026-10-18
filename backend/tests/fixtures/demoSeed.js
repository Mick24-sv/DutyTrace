import { closePool, withTransaction } from '../../src/db/pool.js';
import { hashPassword } from '../../src/utils/password.js';
import { isProduction } from '../../src/config/env.js';

// TEST FIXTURES ONLY (not used by the running app):  every name, email and office below is FICTIONAL.
// The ".test" domain is reserved and can never be a real address.
// Never put real student information here. Safe to run repeatedly.

export const DEMO_PASSWORD = 'DemoPass!2026';

export const DEMO_OFFICES = [
  { code: 'DEMO-A', name: 'Sample Office A (demo)' },
  { code: 'DEMO-B', name: 'Sample Office B (demo)' },
];

export const DEMO_USERS = [
  { email: 'admin@demo.dutytrace.test', fullName: 'Demo Administrator', role: 'admin', office: null },
  { email: 'supervisor@demo.dutytrace.test', fullName: 'Demo Supervisor', role: 'supervisor', office: 'DEMO-A' },
  { email: 'supervisor2@demo.dutytrace.test', fullName: 'Demo Supervisor Two', role: 'supervisor', office: 'DEMO-B' },
  { email: 'student@demo.dutytrace.test', fullName: 'Demo Student', role: 'student', office: 'DEMO-A' },
  { email: 'student2@demo.dutytrace.test', fullName: 'Demo Student Two', role: 'student', office: 'DEMO-A' },
  { email: 'student3@demo.dutytrace.test', fullName: 'Demo Student Three', role: 'student', office: 'DEMO-B' },
];

// FICTIONAL sample case types so the case screens work out of the box. They are not institutional policy:
// real case types and their required documents are configured by an administrator (docs/open-questions.md).
export const DEMO_CASE_TYPES = [
  { code: 'DEMO-HOURS', name: 'Unmet duty hours (sample)', description: 'Sample type for a student whose recorded duty hours are below the configured requirement.', docs: ['Explanation letter'] },
  { code: 'DEMO-OTHER', name: 'Other requirement (sample)', description: 'Sample type with no required documents; staff can add requirements to the case.', docs: [] },
];

export async function seed({ log = console.log } = {}) {
  if (isProduction) {
    throw new Error('Refusing to seed demo accounts when NODE_ENV=production.');
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await withTransaction(async (db) => {
    const { rows: [institution] } = await db.query(
      `INSERT INTO institutions (name, timezone) VALUES ('DutyTrace Test Institution', $1)
       ON CONFLICT (lower(name)) DO UPDATE SET timezone = EXCLUDED.timezone RETURNING id`,
      [process.env.APP_TIMEZONE ?? 'UTC'],
    );
    await db.query(
      `INSERT INTO institution_dtr_policies (institution_id, required_monthly_hours, updated_by, updated_at)
       SELECT $1, required_monthly_hours, updated_by, updated_at FROM policy_settings
       ON CONFLICT (institution_id) DO NOTHING`,
      [institution.id],
    );
    for (const o of DEMO_OFFICES) {
      await db.query(
        `INSERT INTO offices (code, name, institution_id) VALUES ($1, $2, $3)
         ON CONFLICT (institution_id, lower(code)) DO UPDATE SET name = EXCLUDED.name`,
        [o.code, o.name, institution.id],
      );
    }
    // Each demo office gets a valid QR code (only if it has none), so scanning works out of the box.
    await db.query(
      `INSERT INTO office_qr_codes (office_id)
       SELECT o.id FROM offices o
       WHERE lower(o.code) = ANY($1)
         AND NOT EXISTS (SELECT 1 FROM office_qr_codes q WHERE q.office_id = o.id AND q.revoked_at IS NULL)`,
      [DEMO_OFFICES.map((o) => o.code.toLowerCase())],
    );
    for (const t of DEMO_CASE_TYPES) {
      await db.query(
        `INSERT INTO case_types (institution_id, code, name, description, required_documents)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (institution_id, lower(code)) DO NOTHING`,
        [institution.id, t.code, t.name, t.description, JSON.stringify(t.docs)],
      );
    }
    for (const u of DEMO_USERS) {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role, institution_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
               role = EXCLUDED.role, status = 'active', institution_id = EXCLUDED.institution_id,
               failed_login_count = 0, locked_until = NULL
         RETURNING id`,
        [u.email, passwordHash, u.fullName, u.role, institution.id],
      );
      if (u.office) {
        // Only create the assignment if the user has no current one.
        await db.query(
          `INSERT INTO duty_assignments (user_id, office_id)
           SELECT $1, o.id FROM offices o
           WHERE lower(o.code) = lower($2)
             AND NOT EXISTS (SELECT 1 FROM duty_assignments d WHERE d.user_id = $1 AND d.ends_on IS NULL)`,
          [rows[0].id, u.office],
        );
      }
    }
  });
  log(`seeded ${DEMO_OFFICES.length} offices, ${DEMO_USERS.length} fictional users and ${DEMO_CASE_TYPES.length} sample case types`);
}
