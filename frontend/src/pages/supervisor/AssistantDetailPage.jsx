import {Clock as UIActionClock} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';

// One assistant's attendance. The API returns 403 unless that student is in this supervisor's office.
export default function AssistantDetailPage() {
  const { userId } = useParams();
  return (
    <>
      <Link to="/supervisor/assistants" className="mb-4 inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal shadow-sm transition-colors hover:border-teal/40 hover:bg-teal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 sm:px-4">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Student Assistants
      </Link>
      <PageHeader icon={UIActionClock} title="Attendance history" />
      <AttendanceHistory endpoint={`/attendance/users/${userId}`} actions={
        <Link to={`/supervisor/assistants?view=historical&studentId=${encodeURIComponent(userId)}`} className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal shadow-sm transition-colors hover:border-teal/40 hover:bg-teal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          <History aria-hidden="true" className="h-4 w-4 shrink-0" />Record historical hours
        </Link>
      } />
    </>
  );
}
