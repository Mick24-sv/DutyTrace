import { query } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';

const fields = `id,title,event_date::text AS date,all_day AS "allDay",
 left(starts_at::text,5) AS "startsAt",left(ends_at::text,5) AS "endsAt",notes`;
const notFound = () => new AppError(404, 'NOT_FOUND', 'Personal event not found.');

export async function personalEventsForMonth({ actor, month }, db = { query }) {
  const { rows } = await db.query(`SELECT ${fields} FROM personal_agenda_events
    WHERE institution_id=$1 AND owner_id=$2 AND event_date >= $3::date
    AND event_date < ($3::date + interval '1 month') ORDER BY event_date,starts_at NULLS FIRST,title,id`,
  [actor.institutionId, actor.id, `${month}-01`]);
  return { month, events: rows };
}

export async function savePersonalEvent({ actor, id, event }, db = { query }) {
  const params = [actor.institutionId, actor.id, event.title, event.date, event.allDay, event.startsAt, event.endsAt, event.notes];
  const { rows: [saved] } = id
    ? await db.query(`UPDATE personal_agenda_events SET title=$3,event_date=$4,all_day=$5,
        starts_at=$6,ends_at=$7,notes=$8,updated_at=now()
        WHERE institution_id=$1 AND owner_id=$2 AND id=$9 RETURNING ${fields}`, [...params, id])
    : await db.query(`INSERT INTO personal_agenda_events(institution_id,owner_id,title,event_date,all_day,starts_at,ends_at,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${fields}`, params);
  if (!saved) throw notFound();
  return saved;
}

export async function deletePersonalEvent({ actor, id }, db = { query }) {
  const { rowCount } = await db.query('DELETE FROM personal_agenda_events WHERE institution_id=$1 AND owner_id=$2 AND id=$3', [actor.institutionId, actor.id, id]);
  if (!rowCount) throw notFound();
}
