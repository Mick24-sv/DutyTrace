import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { readPayload } from '../qr/qr.service.js';
import { buildSessions, summarizeMonth } from './calc.js';

const maxSessionSeconds = () => env.maxSessionHours * 3600;

// ------------------------------------------------------------------ state
// Current state is decided by the user's most recent event.
export async function getState(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT event_type, recorded_at FROM attendance_events
     WHERE user_id = $1 ORDER BY recorded_at DESC, seq DESC LIMIT 1`,
    [userId],
  );
  const last = rows[0];
  return last?.event_type === 'time_in'
    ? { state: 'timed_in', since: last.recorded_at }
    : { state: 'timed_out', since: last?.recorded_at ?? null };
}

// ------------------------------------------------------------------- scan
const reject = (status, code, message) => new AppError(status, code, message);

// Records the signed-in user's OWN time-in or time-out.
// The timestamp is the database clock (default now()); the request cannot supply one.
export async function scan({ user, action, qrPayload, ip, userAgent }) {
  try {
    return await withTransaction(async (db) => {
      // 1. The QR code must be genuine (signed by us) ...
      const qrId = readPayload(qrPayload);
      if (!qrId) throw reject(400, 'INVALID_QR', 'This is not a valid DutyTrace QR code.');

      // 2. ... and still valid (not revoked).
      const { rows: qrRows } = await db.query(
        `SELECT q.id, q.revoked_at, o.id AS office_id, o.code, o.name, o.is_active
         FROM office_qr_codes q JOIN offices o ON o.id = q.office_id WHERE q.id = $1`,
        [qrId],
      );
      const qr = qrRows[0];
      if (!qr) throw reject(400, 'INVALID_QR', 'This is not a valid DutyTrace QR code.');
      if (qr.revoked_at) throw reject(400, 'QR_REVOKED', 'This QR code has been replaced or revoked. Ask an administrator for the current code.');
      if (!qr.is_active) throw reject(403, 'OFFICE_INACTIVE', 'This office is not active.');

      // 3. The user must be assigned to the office the code belongs to.
      if (!user.office) throw reject(403, 'NOT_ASSIGNED', 'You are not assigned to an office. Ask an administrator.');
      if (user.office.id !== qr.office_id) {
        throw reject(403, 'WRONG_OFFICE', `This QR code belongs to a different office than your assignment (${user.office.name}).`);
      }

      // 4. Serialize this user's scans so two quick taps/devices can't both pass the checks below.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`attendance:${user.id}`]);

      // 5. The action must fit the current state (no double time-in, no time-out without a time-in).
      const current = await getState(user.id, db);
      if (action === 'time_in' && current.state === 'timed_in') {
        throw reject(409, 'ALREADY_TIMED_IN', 'You are already timed in. Scan again to time out.');
      }
      if (action === 'time_out' && current.state !== 'timed_in') {
        throw reject(409, 'NO_ACTIVE_SESSION', 'You are not timed in, so there is nothing to time out of.');
      }

      const { rows } = await db.query(
        `INSERT INTO attendance_events (user_id, office_id, event_type, qr_code_id, source, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, 'qr', $5, $6) RETURNING id, recorded_at`,
        [user.id, qr.office_id, action, qr.id, ip, userAgent?.slice(0, 300) ?? null],
      );
      const event = rows[0];

      await recordAudit({
        actorId: user.id, action: `attendance.${action}`, targetType: 'attendance_event', targetId: event.id,
        after: { officeId: qr.office_id, qrCodeId: qr.id, recordedAt: event.recorded_at }, ip,
      }, db);

      let session = null;
      if (action === 'time_out') {
        const secs = Math.round((event.recorded_at - current.since) / 1000);
        session = { seconds: secs, needsReview: secs > maxSessionSeconds() };
      }
      return {
        event: { id: event.id, type: action, recordedAt: event.recorded_at },
        state: action === 'time_in' ? 'timed_in' : 'timed_out',
        office: { id: qr.office_id, code: qr.code, name: qr.name },
        timezone: env.timezone,
        session,
      };
    });
  } catch (err) {
    // Log refused scans (outside the rolled-back transaction) so odd patterns are visible.
    if (err instanceof AppError && err.status < 500) {
      await recordAudit({
        actorId: user.id, action: 'attendance.scan_rejected', targetType: 'user', targetId: user.id,
        after: { reason: err.code, attempted: action }, ip,
      }).catch(() => {});
    }
    throw err;
  }
}

// ---------------------------------------------------------------- history
export const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

// Month boundaries are LOCAL (APP_TIMEZONE), computed by PostgreSQL so DST rules are respected.
async function resolveMonth(requested) {
  const { rows } = await query(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS current_month, now() AS db_now`,
    [env.timezone],
  );
  const month = requested ?? rows[0].current_month;
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { month, startDate: `${month}-01`, nextDate: `${next}-01`, now: rows[0].db_now };
}

// Events in the month plus 2 days either side, so a session that straddles a
// month boundary still pairs up correctly. Only sessions that START in the
// month are reported for it.
async function fetchEvents(userIds, { startDate, nextDate }) {
  const { rows } = await query(
    `SELECT user_id, id, event_type, recorded_at FROM attendance_events
     WHERE user_id = ANY($1::uuid[])
       AND recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
       AND recorded_at <  (($3::date + 2)::timestamp AT TIME ZONE $4)
     ORDER BY user_id, recorded_at, seq`,
    [userIds, startDate, nextDate, env.timezone],
  );
  const byUser = new Map(userIds.map((id) => [id, []]));
  for (const r of rows) {
    byUser.get(r.user_id).push({ id: r.id, eventType: r.event_type, recordedAt: r.recorded_at });
  }
  return byUser;
}

const summarize = (events, range) =>
  summarizeMonth(
    buildSessions(events, { now: range.now, timeZone: env.timezone, maxSessionSeconds: maxSessionSeconds() }),
    range.month,
  );

const meta = (range) => ({ month: range.month, timezone: env.timezone, maxSessionHours: env.maxSessionHours });

// Supervisor-verified seconds per (user, month): ONLY approved DTRs count.
// Recorded hours are never promoted to verified hours by any other path.
async function verifiedSeconds(userIds, month) {
  const { rows } = await query(
    `SELECT user_id, verified_seconds FROM monthly_dtrs
     WHERE user_id = ANY($1::uuid[]) AND month = $2 AND status = 'approved'`,
    [userIds, month],
  );
  return new Map(rows.map((r) => [r.user_id, r.verified_seconds]));
}

const withVerified = (summary, secs) =>
  secs === undefined
    ? summary
    : { ...summary, totals: { ...summary.totals, verifiedHours: Math.round((secs / 3600) * 100) / 100, verificationAvailable: true } };

export async function monthHistory(userId, requestedMonth) {
  const range = await resolveMonth(requestedMonth);
  const events = (await fetchEvents([userId], range)).get(userId);
  const verified = await verifiedSeconds([userId], range.month);
  return { ...meta(range), ...withVerified(summarize(events, range), verified.get(userId)) };
}

// One row per student currently assigned to the office.
export async function officeSummary(officeId, requestedMonth) {
  const range = await resolveMonth(requestedMonth);
  const { rows: students } = await query(
    `SELECT u.id, u.full_name, u.email FROM duty_assignments d
     JOIN users u ON u.id = d.user_id
     WHERE d.office_id = $1 AND d.ends_on IS NULL AND u.role = 'student' AND u.status = 'active'
     ORDER BY u.full_name`,
    [officeId],
  );
  const ids = students.map((s) => s.id);
  const events = await fetchEvents(ids, range);
  const { rows: last } = await query(
    `SELECT DISTINCT ON (user_id) user_id, event_type, recorded_at FROM attendance_events
     WHERE user_id = ANY($1::uuid[]) ORDER BY user_id, recorded_at DESC, seq DESC`,
    [ids],
  );
  const lastBy = new Map(last.map((r) => [r.user_id, r]));
  const verified = await verifiedSeconds(ids, range.month);

  return {
    ...meta(range),
    assistants: students.map((s) => {
      const l = lastBy.get(s.id);
      return {
        id: s.id,
        fullName: s.full_name,
        email: s.email,
        state: l?.event_type === 'time_in' ? 'timed_in' : 'timed_out',
        lastEventAt: l?.recorded_at ?? null,
        totals: withVerified(summarize(events.get(s.id), range), verified.get(s.id)).totals,
      };
    }),
  };
}
