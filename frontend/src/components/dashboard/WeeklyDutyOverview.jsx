import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Clock3, Search, Sun, Sunset } from 'lucide-react';
import { formatDutyTime, todayKey } from '../../utils/format.js';
import { filterSchedules } from '../../utils/dutyOverview.js';
import UserAvatar from '../ui/UserAvatar.jsx';
import './duty-overview.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SEMESTERS = { first: 'First semester', second: 'Second semester', summer: 'Summer term' };

function ShiftTimes({ day }) {
  if (!day) return <span className="duty-unavailable" aria-label="Not available">—</span>;
  const periods = [{ start: day.startsAt, end: day.endsAt }, ...(day.afternoonStartsAt ? [{ start: day.afternoonStartsAt, end: day.afternoonEndsAt }] : [])];
  return <div className="duty-shift-times">{periods.map(({ start, end }, index) => {
    const afternoon = Number(start?.slice(0, 2)) >= 12;
    const Icon = afternoon ? Sunset : Sun;
    return <span key={index} className={`duty-time-chip ${afternoon ? 'duty-time-pm' : 'duty-time-am'}`}><Icon size={11} aria-hidden="true" /><span>{formatDutyTime(start)}<span className="duty-time-separator">–</span>{formatDutyTime(end)}</span></span>;
  })}</div>;
}

function ScheduleStudent({ schedule }) {
  return <div className="duty-student"><UserAvatar user={{ fullName: schedule.studentName, photoUrl: schedule.photoUrl }} className="h-9 w-9 text-xs" /><div><Link to={`/supervisor/assistants/${schedule.studentId}`}>{schedule.studentName}</Link><span className={`duty-schedule-status ${schedule.status === 'approved' ? 'is-approved' : 'is-pending'}`}>{schedule.status === 'approved' ? 'Approved' : 'Pending review'}</span></div></div>;
}

export default function WeeklyDutyOverview({ query, timezone, assignedOffice }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const today = new Date(`${todayKey(timezone)}T12:00:00Z`).getUTCDay();
  const [selectedDay, setSelectedDay] = useState(today >= 1 && today <= 6 ? today : 1);
  const schedules = query.data?.schedules ?? [];
  const filtered = filterSchedules(schedules, search, status);
  const daySchedules = filtered.filter(schedule => schedule.days.some(day => day.weekday === selectedDay));
  const term = query.data?.term;
  return <section className="duty-overview-card duty-weekly" aria-labelledby={`${id}-heading`}>
    <header className="duty-card-header"><div className="duty-card-heading"><span className="duty-heading-icon"><CalendarDays size={20} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>Weekly duty schedule</h2><p>{term ? `${term.academicYear} · ${SEMESTERS[term.semester] ?? term.semester}` : 'Office schedule'} · Recurring weekly preferences</p></div></div><Link data-tutorial="schedule-review" className="duty-card-link" to="/supervisor/schedule-review">Review preferences<ArrowUpRight size={15} aria-hidden="true" /></Link></header>
    <div className="duty-overview-toolbar"><label className="duty-overview-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Search schedule by student name</span><input type="search" placeholder="Find a student…" value={search} onChange={event => setSearch(event.target.value)} /></label><label><span className="sr-only">Filter schedule status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All schedules</option><option value="approved">Approved</option><option value="pending_review">Pending review</option></select></label><span className="duty-result-count">{filtered.length} {filtered.length === 1 ? 'student' : 'students'}</span></div>
    <div className="duty-day-selector" aria-label="Schedule day">{DAYS.map((day, index) => <button type="button" key={day} aria-pressed={selectedDay === index + 1} onClick={() => setSelectedDay(index + 1)}><span>{day.slice(0, 3)}</span>{today === index + 1 && <i aria-label="Today" />}</button>)}</div>
    {query.loading ? <p className="duty-overview-empty" role="status">Loading weekly schedules…</p> : query.error ? <p className="duty-overview-error" role="alert">Unable to load schedules: {query.error}</p> : <>
      <div className="duty-week-grid"><table><caption className="sr-only">Student duty preferences from Monday to Saturday</caption><thead><tr><th scope="col">Student Assistant</th>{DAYS.map((day, index) => <th key={day} scope="col" className={today === index + 1 ? 'is-today' : ''}>{day.slice(0, 3)}{today === index + 1 && <span>Today</span>}</th>)}</tr></thead><tbody>{filtered.map(schedule => <tr key={schedule.id}><th scope="row"><ScheduleStudent schedule={schedule} /></th>{DAYS.map((day, index) => <td key={day} className={today === index + 1 ? 'is-today' : ''}><ShiftTimes day={schedule.days.find(item => item.weekday === index + 1)} /></td>)}</tr>)}</tbody></table>{filtered.length === 0 && <p className="duty-overview-empty">{search || status ? 'No schedules match your filters.' : assignedOffice ? 'No submitted or approved schedules yet.' : 'An office assignment is needed to show schedules.'}</p>}</div>
      <div className="duty-day-list"><div className="duty-day-list-heading"><h3>{DAYS[selectedDay - 1]}</h3><span>{daySchedules.length} scheduled</span></div>{daySchedules.map(schedule => <article key={schedule.id}><ScheduleStudent schedule={schedule} /><ShiftTimes day={schedule.days.find(day => day.weekday === selectedDay)} /></article>)}{daySchedules.length === 0 && <p className="duty-overview-empty">{search || status ? 'No matching students scheduled for this day.' : 'No students scheduled for this day.'}</p>}</div>
    </>}
    <footer className="duty-weekly-footer"><div className="duty-shift-legend"><span><i className="duty-legend-am" />Morning</span><span><i className="duty-legend-pm" />Afternoon</span></div><p><Clock3 size={12} aria-hidden="true" />Only approved schedules are confirmed assignments.</p></footer>
  </section>;
}
