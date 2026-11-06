import {History as UIActionHistory} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import HistoricalDutyHoursPanel from '../../components/attendance/HistoricalDutyHoursPanel.jsx';
import HistoricalDutyCreditsReview from '../../components/attendance/HistoricalDutyCreditsReview.jsx';
import SectionLinks from '../../components/layout/SectionLinks.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
export default function HistoricalHoursPage() {
  const {user} = useAuth();
  return <><PageHeader icon={UIActionHistory} title="Previous official duty records" description="Import hours from older paper DTRs or official records. To correct a QR session, open the student's attendance history." />
    <SectionLinks links={user.role === 'supervisor' ? [['/supervisor/assistants', 'Back to students']] : [['/admin/settings', 'Back to settings']]} />
    {user.role === 'supervisor' ? <HistoricalDutyHoursPanel /> : <HistoricalDutyCreditsReview />}
  </>;
}
