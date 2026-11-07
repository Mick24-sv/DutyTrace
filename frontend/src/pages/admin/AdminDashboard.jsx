import {LayoutDashboard as UIActionLayoutDashboard} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Users, FileText } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import SemesterCompletionDonut from '../../components/dashboard/SemesterCompletionDonut.jsx';

export default function AdminDashboard() {
  const {data, loading, error} = useApiData('/reports/dashboard-stats');
  const term = data?.semesterSummary;
  return <>
    <PageHeader icon={UIActionLayoutDashboard} title="Home" description="Manage student accounts, office assignments, and DTR records." />
    {loading && <p role="status" className="mb-4 text-sm text-muted">Loading institution overview…</p>}
    {error && <p role="alert" className="mb-4 text-sm text-bad-fg">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Student assistants" value={data?.users?.students ?? '—'} icon={Users} />
      <StatCard label="DTRs awaiting review" value={data?.dtrs?.pendingReview ?? '—'} icon={FileText} />
    </div>
    <Card className="mt-5" title="Current semester" action={<Link to="/admin/reports?tab=semester-hours" className="text-sm text-teal underline">View progress report</Link>}>
      {term?.term ? <>
        <p className="mb-4 text-sm font-medium">{term.term.academicYear} · {({first:'First semester',second:'Second semester',summer:'Summer term'})[term.term.semester]}</p>
        <SemesterCompletionDonut summary={term} reportPath="/admin/reports" />
      </> : <p className="text-sm text-muted">{loading ? 'Loading current term…' : 'No current academic term. Set up dates and student hour requirements under Academic Terms.'}</p>}
    </Card>
    <Card className="mt-5" title="Manage your institution">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['/admin/users','Students & staff','Manage accounts and office assignments.'],
          ['/admin/semesters','Academic terms','Set term dates and each student’s required hours.'],
          ['/admin/dtrs','DTR records','Check submitted and approved monthly records.'],
          ['/admin/settings','Settings','Manage QR codes, attendance rules, and audit history.'],
        ].map(([to,title,description])=><Link key={to} to={to} className="rounded-lg border border-line p-4 hover:bg-canvas"><b className="block text-sm text-teal">{title}</b><span className="mt-1 block text-sm text-muted">{description}</span></Link>)}
      </div>
    </Card>
  </>;
}
