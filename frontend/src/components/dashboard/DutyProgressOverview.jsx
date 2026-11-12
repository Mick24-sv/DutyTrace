import { Fragment, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, CheckCheck, ChevronDown, Search, ShieldCheck, Users } from 'lucide-react';
import SemesterStatusBadge from '../attendance/SemesterStatusBadge.jsx';
import UserAvatar from '../ui/UserAvatar.jsx';
import { formatHours, formatMonth } from '../../utils/format.js';
import { dutyProgress, monthlyVerification } from '../../utils/dutyOverview.js';
import './duty-overview.css';

function MonthlyBreakdown({ student, months }) {
  return <div className="duty-monthly-breakdown"><header><h3>Monthly breakdown</h3><p>Semester progress uses approved DTRs plus historical credits. QR hours are shown separately.</p></header><div className="duty-month-cards">{months.map(month => {
    const hours = monthlyVerification(student, month);
    return <section className="duty-month-card" key={month} aria-label={formatMonth(month)}><h4>{formatMonth(month)}</h4><dl><div><dt><span className="duty-metric-dot duty-dot-verified" />Verified attendance</dt><dd>{hours.pending ? <span className="duty-month-pending">Pending approval</span> : formatHours(hours.verified)}</dd></div><div><dt><span className="duty-metric-dot duty-dot-recorded" />QR recorded</dt><dd>{formatHours(hours.recorded)}</dd></div><div><dt><span className="duty-metric-dot duty-dot-history" />Historical verified</dt><dd>{formatHours(hours.historical)}</dd></div></dl></section>;
  })}</div>{!months.length && <p className="duty-overview-empty">No monthly records for this term.</p>}</div>;
}

export default function DutyProgressOverview({ assistants, months, term, loading, error }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [standing, setStanding] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const filtered = assistants.filter(student => student.studentName.toLowerCase().includes(search.trim().toLowerCase()) && (!standing || student.semesterStatus === standing));
  const completed = assistants.filter(student => student.semesterStatus === 'completed').length;
  const attention = assistants.filter(student => ['at_risk', 'overdue'].includes(student.semesterStatus)).length;
  function toggle(studentId) { setExpanded(current => { const next = new Set(current); if (next.has(studentId)) next.delete(studentId); else next.add(studentId); return next; }); }

  return <section className="duty-overview-card duty-progress-overview" aria-labelledby={`${id}-heading`}>
    <header className="duty-card-header"><div className="duty-card-heading"><span className="duty-heading-icon duty-heading-progress"><BarChart3 size={20} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>Duty progress</h2><p>{term ? `${term.academicYear} · ${{first:'First semester',second:'Second semester',summer:'Summer term'}[term.semester] ?? term.semester}` : 'No active academic term'}</p></div></div><Link className="duty-card-link" to="/supervisor/reports?tab=semester-hours">Full report<ArrowUpRight size={15} aria-hidden="true" /></Link></header>
    <div className="duty-progress-stats"><div><span><Users size={15} aria-hidden="true" />Assigned students</span><strong>{loading ? '—' : assistants.length}</strong></div><div><span><CheckCheck size={15} aria-hidden="true" />Completed</span><strong>{loading ? '—' : completed}</strong></div><div><span><ShieldCheck size={15} aria-hidden="true" />Need attention</span><strong>{loading ? '—' : attention}</strong></div></div>
    <div className="duty-overview-toolbar"><label className="duty-overview-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Search duty progress by student name</span><input type="search" placeholder="Find a student…" value={search} onChange={event => setSearch(event.target.value)} /></label><label><span className="sr-only">Filter student standing</span><select value={standing} onChange={event => setStanding(event.target.value)}><option value="">All standings</option>{Object.entries({on_track:'On track',at_risk:'At risk',overdue:'Overdue',completed:'Completed',insufficient_data:'Insufficient data',not_configured:'Not configured'}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span className="duty-result-count">{filtered.length} {filtered.length === 1 ? 'student' : 'students'}</span></div>
    {loading ? <p className="duty-overview-empty" role="status">Loading duty progress…</p> : error ? <p className="duty-overview-error" role="alert">Unable to load duty progress: {error}</p> : <table className="duty-progress-table"><caption className="sr-only">Verified semester hours, progress and standing for assigned students</caption><thead><tr><th scope="col">Student Assistant</th><th scope="col">Verified / Required</th><th scope="col">Semester progress</th><th scope="col">Standing</th><th scope="col"><span className="sr-only">Monthly breakdown</span></th></tr></thead><tbody>{filtered.map(student => {
      const progress = dutyProgress(student);
      const isExpanded = expanded.has(student.id);
      const detailId = `${id}-${student.id}`;
      return <Fragment key={student.id}><tr className={`duty-progress-row ${isExpanded ? 'is-expanded' : ''}`}>
        <th scope="row"><div className="duty-student"><UserAvatar user={{fullName:student.studentName,photoUrl:student.photoUrl}} className="h-9 w-9 text-xs" /><div><Link to={`/supervisor/assistants/${student.id}`}>{student.studentName}</Link><span>{progress.assigned ? `${formatHours(Math.max(0, progress.required - progress.verified))} remaining` : 'No semester target'}</span></div></div></th>
        <td><span className="duty-mobile-label">Verified / Required</span><div className="duty-hours-value"><strong>{formatHours(progress.verified)}</strong><span>/ {progress.assigned ? formatHours(progress.required) : 'Not assigned'}</span></div></td>
        <td className="duty-progress-meter-cell"><span className="duty-mobile-label">Semester progress</span>{progress.assigned ? <div className={`duty-progress-meter ${student.semesterStatus === 'completed' ? 'is-complete' : ['at_risk','overdue'].includes(student.semesterStatus) ? 'needs-attention' : ''}`}><div role="progressbar" aria-label={`${student.studentName}: semester duty progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage}><span style={{width:`${progress.percentage}%`}} /></div><span>{progress.percentage}%</span></div> : <span className="duty-no-target">No target assigned</span>}</td>
        <td className="duty-standing-cell"><span className="duty-mobile-label">Standing</span><SemesterStatusBadge status={student.semesterStatus} /></td>
        <td className="duty-expand-cell"><button type="button" aria-expanded={isExpanded} aria-controls={isExpanded ? detailId : undefined} onClick={() => toggle(student.id)}><span>Monthly details</span><ChevronDown size={17} aria-hidden="true" /></button></td>
      </tr>{isExpanded && <tr className="duty-progress-detail-row"><td colSpan={5}><div id={detailId}><MonthlyBreakdown student={student} months={months} /></div></td></tr>}</Fragment>;
    })}</tbody></table>}
    {!loading && !error && !filtered.length && <p className="duty-overview-empty">{search || standing ? 'No students match your filters.' : 'No assistants assigned to your office.'}</p>}
    <footer className="duty-progress-footer"><ShieldCheck size={13} aria-hidden="true" />Verified totals use approved DTRs and historical credits. Expand a student to see each month.</footer>
  </section>;
}
