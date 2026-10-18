import { closePool, query, withTransaction } from '../../src/db/pool.js';
import { env, isProduction } from '../../src/config/env.js';

// DEVELOPMENT ONLY, FICTIONAL DATA. Inserts sample attendance for LAST month
// for the demo students so the history screens have something to show.
// Skips any student who already has events, so it is safe to re-run.
// (This writes timestamps directly; the real API can never do that.)
//
// Sample pattern, per student (local time, APP_TIMEZONE):
//   student@   : 3 full days (8 h each)                       -> 24.00 h recorded
//   student2@  : 2 normal days (4 h each) + 1 forgotten time-out -> 8.00 h recorded, 1 needs attention

const PLAN = {
  'student@demo.dutytrace.test': [
    ['02', [['08:00', '12:00'], ['13:00', '17:00']]],
    ['03', [['08:00', '12:00'], ['13:00', '17:00']]],
    ['04', [['08:00', '12:00'], ['13:00', '17:00']]],
  ],
  'student2@demo.dutytrace.test': [
    ['02', [['08:00', '12:00']]],
    ['03', [['13:00', '17:00']]],
    ['04', [['08:00', null]]], // never timed out
  ],
};

export async function seedAttendance({ log = console.log } = {}) {
  if (isProduction) throw new Error('Refusing to seed sample attendance when NODE_ENV=production.');
  const { rows: m } = await query(
    "SELECT to_char((now() AT TIME ZONE $1)::date - interval '1 month', 'YYYY-MM') AS month",
    [env.timezone],
  );
  const month = m[0].month;

  await withTransaction(async (db) => {
    for (const [email, days] of Object.entries(PLAN)) {
      const { rows } = await db.query(
        `SELECT u.id, d.office_id, (SELECT count(*) FROM attendance_events e WHERE e.user_id = u.id)::int AS n
         FROM users u JOIN duty_assignments d ON d.user_id = u.id AND d.ends_on IS NULL WHERE u.email = $1`,
        [email],
      );
      const u = rows[0];
      if (!u || u.n > 0) { log(`skipped ${email}`); continue; }
      for (const [day, sessions] of days) {
        for (const [timeIn, timeOut] of sessions) {
          for (const [type, time] of [['time_in', timeIn], ['time_out', timeOut]]) {
            if (!time) continue;
            await db.query(
              `INSERT INTO attendance_events (user_id, office_id, event_type, recorded_at, source)
               VALUES ($1, $2, $3, ($4::date + $5::time) AT TIME ZONE $6, 'seed')`,
              [u.id, u.office_id, type, `${month}-${day}`, time, env.timezone],
            );
          }
        }
      }
      log(`seeded sample attendance for ${email} (${month})`);
    }
  });
  return month;
}

