import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, CalendarDays, ChartPie, Info } from 'lucide-react';
import SemesterCompletionDonut from './SemesterCompletionDonut.jsx';
import './semester-completion.css';

const TERMS = { first: 'First semester', second: 'Second semester', summer: 'Summer term' };

export default function SemesterProgressOverview({ summary, role, loading, error, officeName }) {
  const id = useId();
  const admin = role === 'admin';
  const reportPath = `/${role}/reports`;
  const reportLink = summary?.term ? `${reportPath}?tab=semester-hours&termId=${encodeURIComponent(summary.term.id)}` : `${reportPath}?tab=semester-hours`;
  return <section className="semester-overview-card" aria-labelledby={`${id}-heading`}>
    <header className="semester-overview-header"><div><span className="semester-overview-icon"><ChartPie size={21} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>{admin ? 'Institution semester progress' : 'My office’s semester progress'}</h2><p>{summary?.term ? `${summary.term.academicYear} · ${TERMS[summary.term.semester] ?? summary.term.semester}` : 'Semester completion overview'}</p></div></div><Link className="semester-overview-report" to={reportLink}>View progress report<ArrowUpRight size={14} aria-hidden="true" /></Link></header>
    {error ? <p role="alert" className="semester-overview-error">Unable to load semester progress. {error}</p> : !summary?.term ? <div className="semester-overview-empty"><CalendarDays size={30} aria-hidden="true" /><h3>{loading ? 'Loading semester progress…' : 'A new semester starts here'}</h3><p role={loading ? 'status' : undefined}>{loading ? 'Getting student completion totals.' : admin ? 'Set up an academic term and student requirements to see completion progress.' : 'No current academic term is configured. Ask your administrator to set up the semester.'}</p>{!loading && admin && <Link to="/admin/semesters">Manage academic terms<ArrowUpRight size={14} aria-hidden="true" /></Link>}</div> : <>
      <div className="semester-overview-scope"><span><Building2 size={13} aria-hidden="true" />{admin ? 'Institution-wide overview' : officeName || 'Your office'}</span><span><CalendarDays size={12} aria-hidden="true" />Current academic term</span></div>
      <SemesterCompletionDonut summary={summary} reportPath={reportPath} includeUnassigned={!admin} />
      <footer className="semester-overview-footer"><Info size={13} aria-hidden="true" /><span>{admin ? 'The chart includes students with assigned requirements. Students without a target are shown separately.' : 'The chart includes assigned students, including those without a semester target.'} Select a category to open its filtered report.</span></footer>
    </>}
  </section>;
}
