import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceHistory from '../../components/attendance/AttendanceHistory.jsx';

// Student Assistants and Supervisors each see only their OWN attendance here.
export default function MyAttendancePage() {
  return (
    <>
      <PageHeader title="My Attendance" description="Daily and monthly time-in/time-out records." />
      <AttendanceHistory endpoint="/attendance/me" />
    </>
  );
}
