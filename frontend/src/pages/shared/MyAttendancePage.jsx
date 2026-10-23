import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';
import MonthlyDutySummary from '../../components/attendance/MonthlyDutySummary.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';

// Student Assistants and Supervisors each see only their OWN attendance here.
export default function MyAttendancePage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="My Attendance" description="Daily and monthly time-in/time-out records." />
      <AttendanceHistory endpoint="/attendance/me" />
      {user?.role === 'student' && <MonthlyDutySummary />}
    </>
  );
}
