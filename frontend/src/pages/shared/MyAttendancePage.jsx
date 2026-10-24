import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';
import MonthlyDutySummary from '../../components/attendance/MonthlyDutySummary.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { ChevronDown } from 'lucide-react';

// Student Assistants and Supervisors each see only their OWN attendance here.
export default function MyAttendancePage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="My Attendance" description="Daily and monthly time-in/time-out records." />
      <AttendanceHistory endpoint="/attendance/me" />
      {user?.role === 'student' && (
        <details className="group mt-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 py-3 text-sm font-medium text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal [&::-webkit-details-marker]:hidden">
            Semester duty summary
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <MonthlyDutySummary />
        </details>
      )}
    </>
  );
}
