import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleHelp, ClipboardList, Clock3, Info, TriangleAlert } from 'lucide-react';
import SemesterStatusBadge from '../attendance/SemesterStatusBadge.jsx';
import DtrStatusBadge from '../dtr/DtrStatusBadge.jsx';
import Badge from '../ui/Badge.jsx';
import UserAvatar from '../ui/UserAvatar.jsx';
import { formatHours } from '../../utils/format.js';
import { dutyFollowUp } from '../../utils/dutyOverview.js';
import './duty-overview.css';
import './duty-follow-up.css';

export default function DutyFollowUpOverview({ students, loading, error }) {
  const id = useId();
  const attention = students.filter(student => ['at_risk', 'overdue'].includes(student.semesterStatus)).length;
  const onTrack = students.filter(student => student.semesterStatus === 'on_track').length;
  const insufficient = students.filter(student => student.semesterStatus === 'insufficient_data').length;
  return <section className="duty-overview-card duty-follow-up" aria-labelledby={`${id}-heading`}>
    <header className="duty-card-header"><div className="duty-card-heading"><span className="duty-heading-icon duty-heading-progress"><ClipboardList size={20} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>Duty hours to follow up</h2><p>Students with assigned semester hours still to complete.</p></div></div><Link className="duty-card-link" to="/supervisor/reports?tab=semester-hours">Detailed hours report<ArrowUpRight size={15} aria-hidden="true" /></Link></header>
    {!loading && !error && students.length > 0 && <div className="duty-follow-up-summary" aria-label="Follow-up summary"><span className="duty-follow-up-count">{students.length} {students.length === 1 ? 'student' : 'students'}</span>{onTrack > 0 && <span className="duty-follow-up-on-track"><CheckCircle2 size={12} aria-hidden="true" />{onTrack} on track</span>}{attention > 0 && <span className="duty-follow-up-attention"><TriangleAlert size={12} aria-hidden="true" />{attention} need attention</span>}{insufficient > 0 && <span className="duty-follow-up-insufficient"><CircleHelp size={12} aria-hidden="true" />{insufficient} insufficient data</span>}</div>}
    {loading ? <p role="status" className="duty-overview-empty">Checking semester hours…</p> : error ? <p role="alert" className="duty-overview-error">Unable to load students: {error}</p> : students.length === 0 ? <div className="duty-follow-up-empty"><CheckCircle2 size={27} aria-hidden="true" /><h3>No outstanding semester hours</h3><p>No assigned semester requirements are currently below target.</p></div> : <table className="duty-follow-up-table"><caption className="sr-only">Students below their assigned semester duty-hour requirement</caption><thead><tr><th scope="col">Student Assistant</th><th scope="col">Semester progress</th><th scope="col">Hours remaining</th><th scope="col">DTR status</th><th scope="col"><span className="sr-only">View student</span></th></tr></thead><tbody>{students.map(student => {
      const progress = dutyFollowUp(student);
      return <tr key={student.id} className={`duty-follow-up-row tone-${progress.tone}`}>
        <th scope="row"><div className="duty-student"><UserAvatar user={{fullName:student.studentName,photoUrl:student.photoUrl}} className="h-10 w-10 text-xs" /><div><Link to={`/supervisor/assistants/${student.id}`}>{student.studentName}</Link><div className="duty-follow-up-standing"><SemesterStatusBadge status={student.semesterStatus} /></div></div></div></th>
        <td className="duty-follow-up-progress"><span className="duty-follow-up-mobile-label">Semester progress</span><div className="duty-follow-up-ratio"><span><strong>{formatHours(progress.verified)}</strong><span> / {progress.assigned ? formatHours(progress.required) : 'Not assigned'}</span></span>{progress.assigned && <b>{progress.percentage}%</b>}</div>{progress.assigned ? <div className="duty-follow-up-track" role="progressbar" aria-label={`${student.studentName}: verified semester hours`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage}><span style={{width:`${progress.percentage}%`}} /></div> : <p className="duty-follow-up-no-target">No semester target assigned</p>}<p className="duty-follow-up-recorded"><Clock3 size={11} aria-hidden="true" />{formatHours(student.recordedHours ?? 0)} QR recorded this month</p></td>
        <td className="duty-follow-up-remaining-cell"><span className="duty-follow-up-mobile-label">Hours remaining</span><div className="duty-follow-up-remaining"><strong>{progress.remaining == null ? '—' : formatHours(progress.remaining)}</strong><span>{progress.tone === 'overdue' ? 'Past deadline' : progress.tone === 'attention' ? 'Needs attention' : progress.tone === 'on-track' ? 'To complete' : 'Remaining target'}</span></div></td>
        <td className="duty-follow-up-dtr"><span className="duty-follow-up-mobile-label">DTR status</span>{!student.dtrStatus || student.dtrStatus === 'none' ? <Badge tone="neutral">Not submitted</Badge> : <DtrStatusBadge status={student.dtrStatus} />}</td>
        <td className="duty-follow-up-action"><Link to={`/supervisor/assistants/${student.id}`} aria-label={`View student: ${student.studentName}`}>View student<ArrowRight size={13} aria-hidden="true" /></Link></td>
      </tr>;
    })}</tbody></table>}
    <footer className="duty-follow-up-footer"><Info size={13} aria-hidden="true" /><span>Hours remaining are based on verified semester totals. Students can still be on track while completing their target.</span></footer>
  </section>;
}
