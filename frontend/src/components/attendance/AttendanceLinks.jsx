import SectionLinks from '../layout/SectionLinks.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
export default function AttendanceLinks() {
  const {user} = useAuth();
  const base = `/${user.role}`;
  const links = user.role === 'student'
    ? [[`${base}/attendance`, 'History'], [`${base}/scan`, 'Time in / out'], [`${base}/discrepancies`, 'Corrections']]
    : user.role === 'supervisor'
      ? [[`${base}/assistants`, 'Students'], [`${base}/discrepancies`, 'Corrections'], [`${base}/office-qr`, 'Office QR']]
      : [[`${base}/settings`, 'Settings'], [`${base}/discrepancies`, 'Attendance corrections']];
  return <SectionLinks links={links} label="Attendance navigation" />;
}
