import PageHeader from '../../components/ui/PageHeader.jsx';
import DutyAlertsPanel from '../../components/notifications/DutyAlertsPanel.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function DutyAlertsPage() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <>
      <PageHeader
        title="Duty Alerts"
        description={role === 'admin'
          ? 'Review institution-wide alerts, monitor office activity, and manage alert rules.'
          : 'Review alerts for your office and follow up on student duty risks.'}
      />
      <DutyAlertsPanel role={role} />
    </>
  );
}
