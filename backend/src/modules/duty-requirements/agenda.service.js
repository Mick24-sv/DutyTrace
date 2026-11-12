import { query } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';

// Scope comes exclusively from the authenticated user, never URL parameters.
export async function agendaForMonth({ actor, month }, db = { query }) {
  if (!['admin', 'supervisor', 'student'].includes(actor.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view an agenda.');
  }
  const scope = { admin: 'institution', supervisor: 'office', student: 'personal' }[actor.role];
  if (actor.role === 'admin') {
    const { rows } = await db.query(`
      SELECT 'concern-'||c.id::text AS id,c.subject AS title,
        (c.updated_at AT TIME ZONE $4)::date::text AS date,'concern' AS kind,
        c.status,'Concern updated · '||replace(c.status,'_',' ') AS detail,
        '/admin/concerns?id='||c.id::text AS href
      FROM concerns c
      WHERE c.institution_id=$1 AND c.status IN ('open','under_review')
        AND EXISTS(SELECT 1 FROM concern_participants p WHERE p.concern_id=c.id
          AND p.user_id=$3 AND NOT p.archived AND NOT p.deleted)
        AND (c.updated_at AT TIME ZONE $4)::date >= $2::date
        AND (c.updated_at AT TIME ZONE $4)::date < ($2::date + interval '1 month')
      UNION ALL
      SELECT 'deadline-'||t.id::text,'Duty completion deadline',t.completion_deadline::text,
        'deadline',NULL::text,t.academic_year||' · '||t.semester||' semester','/admin/semesters'
      FROM academic_terms t
      WHERE t.institution_id=$1 AND t.finalized_at IS NULL
        AND t.completion_deadline >= $2::date
        AND t.completion_deadline < ($2::date + interval '1 month')
      ORDER BY date,kind,title,id`, [actor.institutionId, `${month}-01`, actor.id, actor.institution?.timezone || 'Asia/Manila']);
    return { scope, month, schedules: [], importantItems: rows };
  }
  if (actor.role === 'supervisor' && !actor.office?.id) return { scope, month, schedules: [] };
  const params = [actor.institutionId, `${month}-01`];
  const filter = actor.role === 'student' ? `AND s.student_id=$${params.push(actor.id)}`
    : actor.role === 'supervisor' ? `AND s.office_id=$${params.push(actor.office.id)}` : '';
  const { rows } = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (s.student_id,s.term_id) s.*
      FROM student_duty_schedules s
      WHERE s.institution_id=$1 AND s.status='approved' ${filter}
      ORDER BY s.student_id,s.term_id,s.version DESC
    )
    SELECT s.id,s.student_id,s.office_id,s.effective_starts_on::text,s.effective_ends_on::text,
      u.full_name AS student_name,o.name AS office_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'weekday',d.weekday,'startsAt',left(d.starts_at::text,5),
        'endsAt',left(d.ends_at::text,5),
        'afternoonStartsAt',left(d.afternoon_starts_at::text,5),
        'afternoonEndsAt',left(d.afternoon_ends_at::text,5)
      ) ORDER BY d.weekday) FROM student_duty_schedule_days d WHERE d.schedule_id=s.id),'[]'::jsonb) AS days
    FROM latest s JOIN users u ON u.id=s.student_id JOIN offices o ON o.id=s.office_id
    WHERE s.effective_starts_on < ($2::date + interval '1 month')
      AND s.effective_ends_on >= $2::date
    ORDER BY u.full_name,s.id`, params);
  return {
    scope, month,
    schedules: rows.map(row => ({
      id: row.id, studentId: row.student_id, studentName: row.student_name,
      officeId: row.office_id, officeName: row.office_name, status: 'approved',
      effectiveStartsOn: row.effective_starts_on, effectiveEndsOn: row.effective_ends_on,
      days: row.days,
    })),
  };
}
