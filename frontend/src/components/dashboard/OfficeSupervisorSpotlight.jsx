import { Briefcase, Building2 } from 'lucide-react';
import UserAvatar from '../ui/UserAvatar.jsx';

export default function OfficeSupervisorSpotlight({supervisors}) {
  if(!supervisors.length)return null;
  return <section aria-label="Office Supervisor Spotlight" className="mb-5 min-w-0 rounded-xl border border-line bg-canvas/60 p-3 sm:p-5">
    <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy">
      <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/>Office Supervisor Spotlight
    </h4>
    <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {supervisors.map(supervisor=><li key={supervisor.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm">
        <UserAvatar user={supervisor} className="h-14 w-14 text-lg"/>
        <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-navy">{supervisor.fullName}</p>
        <p className="mt-2 flex items-start gap-2 text-xs text-muted">
          <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-teal"/>
          <span className="min-w-0 break-words">{supervisor.office?.name||'No office assigned'}</span>
        </p>
        </div>
      </li>)}
    </ul>
  </section>;
}
