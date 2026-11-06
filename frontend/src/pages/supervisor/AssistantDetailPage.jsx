import {Clock as UIActionClock} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';

// One assistant's attendance. The API returns 403 unless that student is in this supervisor's office.
export default function AssistantDetailPage() {
  const { userId } = useParams();
  return (
    <>
      <Link to="/supervisor/assistants" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Student Assistants
      </Link>
      <PageHeader icon={UIActionClock} title="Attendance history">
        <Link to={`/supervisor/assistants?view=historical&studentId=${encodeURIComponent(userId)}`} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal hover:bg-canvas">Record historical duty hours</Link>
      </PageHeader>
      <AttendanceHistory endpoint={`/attendance/users/${userId}`} />
    </>
  );
}
