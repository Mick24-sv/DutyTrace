import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Flag, Info, QrCode, TrendingUp } from 'lucide-react';
import SemesterStatusBadge from '../attendance/SemesterStatusBadge.jsx';
import { formatHours } from '../../utils/format.js';
import './student-semester-progress.css';

const TERM_LABELS = { first: 'First semester', second: 'Second semester', summer: 'Summer term' };
const dateLabel = value => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
const MESSAGES = {
  on_track: ['You’re making steady progress', 'Keep building toward your semester goal.'],
  completed: ['Semester target achieved', 'Your verified hours have reached the assigned requirement.'],
  at_risk: ['Your target needs attention', 'Review your remaining hours and plan your next duties.'],
  overdue: ['Your completion deadline has passed', 'Contact your supervisor about the remaining hours.'],
  insufficient_data: ['Your progress starts here', 'Verified duty hours will appear as your records are approved.'],
};

export default function StudentSemesterProgress({ terms, selectedTerm, selectedTermId, onSelect, loading, error }) {
  const id = useId();
  const assigned = Boolean(selectedTerm?.requirementAssigned) && Number(selectedTerm.requiredHours) > 0;
  const verified = Number(selectedTerm?.verifiedHours) || 0;
  const required = Number(selectedTerm?.requiredHours) || 0;
  const percentage = assigned ? Math.round(Math.min(100, Math.max(0, Number(selectedTerm.completionPercentage ?? verified / required * 100) || 0)) * 10) / 10 : 0;
  const remaining = Math.max(0, Number(selectedTerm?.remainingHours ?? required - verified) || 0);
  const message = MESSAGES[selectedTerm?.semesterStatus] ?? ['Your semester at a glance', 'Track verified hours toward your assigned duty-hour target.'];
  const tone = { completed: 'completed', at_risk: 'attention', overdue: 'overdue', insufficient_data: 'neutral' }[selectedTerm?.semesterStatus] ?? 'on-track';
  return <section className={`student-semester-card semester-tone-${tone}`} aria-labelledby={`${id}-heading`}>
    <header className="student-semester-header"><div><span className="student-semester-icon"><TrendingUp size={20} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>Semester progress</h2><p>Your duty hours, one step at a time.</p></div></div>{terms.length > 0 && <label className="student-semester-picker"><CalendarDays size={14} aria-hidden="true" /><span className="sr-only">Academic term</span><select value={selectedTermId} onChange={event => onSelect(event.target.value)}><option value="" disabled>Select academic term</option>{terms.map(term => <option key={term.id} value={term.id}>{term.academicYear} · {TERM_LABELS[term.semester] ?? term.semester}{term.isCurrent ? ' (Current)' : ''}</option>)}</select></label>}</header>
    {loading && !selectedTerm ? <p role="status" className="student-semester-empty">Loading semester progress…</p> : error ? <p role="alert" className="student-semester-error">Unable to load semester progress. {error}</p> : !selectedTerm || !assigned ? <div className="student-semester-empty"><CalendarDays size={30} aria-hidden="true" /><h3>{selectedTerm ? 'Your duty-hour target is not assigned yet' : 'Your semester progress will appear here'}</h3><p>{selectedTerm ? `${selectedTerm.academicYear} · ${TERM_LABELS[selectedTerm.semester] ?? selectedTerm.semester}. Contact your administrator to set your semester requirement.` : 'An academic term and assigned duty-hour target are needed to track your progress.'}</p><Link to="/student/attendance">View attendance<ArrowUpRight size={14} aria-hidden="true" /></Link></div> : <>
      <div className="student-semester-body">
        <div className="student-semester-ring" role="progressbar" aria-label="Verified semester duty-hour progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${formatHours(verified)} verified of ${formatHours(required)} required, ${percentage}% complete`}>
          <svg viewBox="0 0 140 140" aria-hidden="true"><circle className="semester-ring-track" cx="70" cy="70" r="58" /><circle className="semester-ring-value" cx="70" cy="70" r="58" pathLength="100" strokeDasharray={`${percentage} 100`} /></svg>
          <div><strong>{percentage}<span>%</span></strong><span>COMPLETE</span>{percentage >= 100 && <CheckCircle2 size={16} aria-hidden="true" />}</div>
        </div>
        <div className="student-semester-details"><div className="student-semester-title"><div><p>{selectedTerm.academicYear} · {TERM_LABELS[selectedTerm.semester] ?? selectedTerm.semester}</p><h3>{message[0]}</h3></div><SemesterStatusBadge status={selectedTerm.semesterStatus} /></div><p className="student-semester-description">{message[1]}</p>
          <dl className="student-semester-metrics"><div className="semester-metric-verified"><dt><CheckCircle2 size={14} aria-hidden="true" />Verified hours</dt><dd>{verified.toFixed(2)}<span>h</span></dd><p>Counted toward your goal</p></div><div className="semester-metric-required"><dt><Flag size={14} aria-hidden="true" />Semester target</dt><dd>{required.toFixed(2)}<span>h</span></dd><p>Your assigned requirement</p></div><div className="semester-metric-remaining"><dt><Clock3 size={14} aria-hidden="true" />Hours remaining</dt><dd>{remaining.toFixed(2)}<span>h</span></dd><p>{remaining === 0 ? 'Requirement met' : 'Still to complete'}</p></div></dl>
          <div className="student-semester-dates">{selectedTerm.startsOn && selectedTerm.endsOn && <span><CalendarDays size={12} aria-hidden="true" /><time dateTime={selectedTerm.startsOn}>{dateLabel(selectedTerm.startsOn)}</time><span>–</span><time dateTime={selectedTerm.endsOn}>{dateLabel(selectedTerm.endsOn)}</time></span>}{selectedTerm.completionDeadline && <span className="student-semester-deadline"><Flag size={12} aria-hidden="true" />Deadline: <time dateTime={selectedTerm.completionDeadline}>{dateLabel(selectedTerm.completionDeadline)}</time></span>}</div>
        </div>
      </div>
      <footer className="student-semester-footer"><span className="student-semester-recorded"><QrCode size={14} aria-hidden="true" /><strong>{formatHours(selectedTerm.recordedHours ?? 0)}</strong>QR recorded</span><p><Info size={12} aria-hidden="true" />QR-recorded hours are shown separately from verified semester progress.</p><Link to="/student/dtr">View monthly DTRs<ArrowUpRight size={13} aria-hidden="true" /></Link></footer>
    </>}
  </section>;
}
