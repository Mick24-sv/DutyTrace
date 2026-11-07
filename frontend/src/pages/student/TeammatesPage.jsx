import { Link } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import OfficeTeammates from '../../components/dashboard/OfficeTeammates.jsx';

export default function TeammatesPage(){
 return <>
  <Link to="/student" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal shadow-sm hover:bg-teal/5"><ArrowLeft aria-hidden="true" className="h-4 w-4"/>Back to home</Link>
  <PageHeader icon={Users} title="Office teammates" description="Meet the student assistants assigned to your office."/>
  <OfficeTeammates/>
 </>;
}
