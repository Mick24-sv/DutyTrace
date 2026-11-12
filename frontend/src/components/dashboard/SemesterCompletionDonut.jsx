import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Clock3, ClipboardList, TrendingUp } from 'lucide-react';
import { semesterCompletion } from '../../utils/semesterCompletion.js';
import './semester-completion.css';

const ICONS = { completed: CheckCircle2, remaining: Clock3, unassigned: ClipboardList };

export default function SemesterCompletionDonut({ summary, reportPath, includeUnassigned = false }) {
  const { groups, counts, assigned, total, completionPercentage } = semesterCompletion(summary, includeUnassigned);
  const destination = group => `${reportPath}?tab=semester-hours&termId=${encodeURIComponent(summary.term.id)}&completion=${group}`;
  let offset = 0;
  const segmentCount = groups.filter(group => group.inChart && group.count > 0).length;
  const slices = groups.filter(group => group.inChart).map(group => {
    const slice = { ...group, offset, arc: Math.max(0, group.fraction - (segmentCount > 1 ? 1.3 : 0)) };
    offset += group.fraction;
    return slice;
  });
  const chartKey = `${summary.term.id}:${includeUnassigned}:${Object.values(counts).join(':')}`;
  return <div className="semester-completion-layout">
    <div className="semester-completion-chart-wrap"><div className="semester-completion-chart" key={chartKey}>
      <svg viewBox="0 0 140 140" role="group" aria-label="Student semester completion chart"><circle className="semester-completion-track" cx="70" cy="70" r="55" fill="none" strokeWidth="12" />{slices.filter(slice => slice.count > 0).map(slice => <Link key={slice.key} className={`semester-completion-slice completion-${slice.tone}`} to={destination(slice.key)} aria-label={`${slice.label}: ${slice.count} students, ${Math.round(slice.fraction)} percent. View filtered report.`}>
        <title>{slice.label}: {slice.count}</title><circle className="semester-donut-arc" cx="70" cy="70" r="55" fill="none" stroke="currentColor" strokeWidth="12" pathLength="100" transform={`rotate(${slice.offset * 3.6 - 90} 70 70)`} style={{ '--arc': slice.arc, '--rest': 100 - slice.arc, animationDuration: '750ms' }} />
      </Link>)}</svg>
      <div className="semester-completion-center" aria-hidden="true"><span>STUDENT OVERVIEW</span><strong>{total.toLocaleString()}</strong><p>{includeUnassigned ? 'Assigned students' : 'With semester targets'}</p></div>
    </div><span className="semester-completion-chart-caption">{includeUnassigned ? 'All students assigned to your office' : 'Students with assigned requirements'}</span></div>
    <div className="semester-completion-details"><div className="semester-completion-intro"><div><span>SEMESTER SNAPSHOT</span><h3>{includeUnassigned ? 'Progress across your office' : 'Progress across your institution'}</h3><p>{assigned ? <><strong>{counts.completed.toLocaleString()} of {assigned.toLocaleString()}</strong> students with a target have completed their requirement.</> : 'Assign semester targets to start tracking student completion.'}</p></div>{assigned > 0 && <span className="semester-completion-rate"><TrendingUp size={13} aria-hidden="true" />{completionPercentage}% complete</span>}</div>
      <ul className="semester-completion-tiles" aria-label="Semester completion groups">{groups.map(group => {
        const Icon = ICONS[group.key];
        return <li key={group.key}><Link className={`semester-completion-tile completion-${group.tone}`} to={destination(group.key)}><span className="semester-completion-tile-top"><span className="semester-completion-tile-icon"><Icon size={18} aria-hidden="true" /></span><ArrowUpRight size={14} aria-hidden="true" /></span><div className="semester-completion-tile-content"><span className="semester-completion-tile-label">{group.label}</span><div><strong>{group.count.toLocaleString()}</strong>{group.inChart ? <span>{Math.round(group.fraction)}%</span> : <span className="semester-completion-outside">Outside chart</span>}</div><p>{group.description}</p></div></Link></li>;
      })}</ul>
      {total === 0 && <p className="semester-completion-no-data">{includeUnassigned ? 'No Student Assistants are assigned to this office yet.' : 'No students have a semester requirement assigned yet.'}</p>}
    </div>
  </div>;
}
