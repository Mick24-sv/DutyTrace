import { CalendarCheck, CircleAlert, Clock, ShieldCheck, Target, Hourglass } from 'lucide-react';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';
import DataTable from '../ui/DataTable.jsx';
import { formatClock, formatDateKey, formatHours } from '../../utils/format.js';

const NOTE = {
  in_progress: 'Open session, not counted',
  missing_time_out: 'Missing time-out, not counted',
  orphan_time_out: 'Time-out without a time-in, not counted',
  needs_review: 'Longer than the maximum, not counted',
};

// Renders ONE revision of a DTR (its frozen snapshot). `verified` is shown separately
// from recorded hours and only has a value once the DTR is approved.
export default function DtrDocument({ snapshot, verifiedHours = null, isApprovedRevision = false }) {
  const { totals, timezone } = snapshot;
  const dtrPolicy=snapshot.policy?.configuration?.dtr??{};
  const formatPolicyDate=(key)=>{
    if(!key)return '—';
    if(dtrPolicy.dateFormat==='DD/MM/YYYY'){const [y,m,d]=key.split('-');return `${d}/${m}/${y}`;}
    if(dtrPolicy.dateFormat==='MM/DD/YYYY'){const [y,m,d]=key.split('-');return `${m}/${d}/${y}`;}
    return dtrPolicy.dateFormat==='YYYY-MM-DD'?key:formatDateKey(key);
  };
  const formatPolicyClock=(iso)=>iso&&dtrPolicy.timeFormat==='24-hour'
    ?new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso))
    :formatClock(iso,timezone);
  const rows = snapshot.days.flatMap((day) =>
    day.sessions.map((s, i) => ({
      id: s.id,
      date: i === 0 ? formatPolicyDate(day.date) : '',
      timeIn: formatPolicyClock(s.timeIn),
      timeOut: formatPolicyClock(s.timeOut),
      hours: s.counted ? formatHours(s.seconds / 3600) : '—',
      counted: s.counted,
      note: [NOTE[s.status], s.flags?.includes('crosses_midnight') ? 'Crosses midnight' : ''].filter(Boolean).join('; '),
    })),
  );

  const columns = [
    { key: 'date', header: 'Date' },
    { key: 'timeIn', header: 'Time in' },
    { key: 'timeOut', header: 'Time out' },
    ...(dtrPolicy.includeDailyTotals===false?[]:[{ key: 'hours', header: 'Hours' }]),
    {
      key: 'note', header: 'Notes',
      render: (r) => (r.note ? <span className={r.counted ? 'text-muted' : 'font-medium text-bad-fg'}>{r.note}</span> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <>
      <p className="mb-4 rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-muted">
        <strong className="text-navy">Provisional template.</strong> This is not the institution's official DTR form.
        Times are shown in {timezone}. Monthly DTR targets are separate from semester duty-hour requirements.
      </p>

      {(dtrPolicy.institutionName||dtrPolicy.headerText||dtrPolicy.includeReportingPeriod===true||dtrPolicy.includeStudentInformation===true||dtrPolicy.includeOfficeSupervisorInformation===true)&&<header className="mb-4 rounded-card border border-line bg-surface px-4 py-3">
        {dtrPolicy.institutionName&&<p className="text-sm font-semibold text-navy">{dtrPolicy.institutionName}</p>}
        {dtrPolicy.headerText&&<p className="mt-1 whitespace-pre-wrap text-sm text-muted">{dtrPolicy.headerText}</p>}
        {dtrPolicy.includeReportingPeriod===true&&<p className="mt-1 text-xs text-muted">Reporting period: {snapshot.month}</p>}
        {dtrPolicy.includeStudentInformation!==false&&<p className="mt-1 text-xs text-muted">{snapshot.student.fullName} · {snapshot.student.email}</p>}
        {dtrPolicy.includeOfficeSupervisorInformation!==false&&<p className="mt-1 text-xs text-muted">Office: {snapshot.office.name}</p>}
      </header>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dtrPolicy.includeMonthlyTotals!==false&&<>
          <StatCard label="Recorded hours" value={formatHours(totals.recordedHours)} hint="Counted sessions only" icon={Clock} />
          <StatCard label="Required hours" value={formatHours(totals.requiredHours)} hint="Configured value" icon={Target} />
          <StatCard label="Remaining (recorded)" value={formatHours(totals.remainingHours)} hint="Required minus recorded" icon={Hourglass} />
        </>}
        <StatCard label="Counted sessions" value={totals.countedSessions} icon={CalendarCheck} />
        <StatCard
          label="Incomplete sessions" value={totals.incompleteCount}
          hint={totals.incompleteCount ? 'Flagged and not counted' : 'None'} icon={CircleAlert}
        />
        <StatCard
          label="Supervisor-verified hours"
          value={isApprovedRevision && verifiedHours != null ? formatHours(verifiedHours) : 'Not verified'}
          hint={isApprovedRevision ? 'Set by supervisor approval' : 'Recorded hours are not verified until approved'}
          icon={ShieldCheck}
        />
      </div>

      {dtrPolicy.includeAttendanceColumns!==false&&<Card title="Daily time records" className="mt-6">
        <DataTable columns={columns} rows={rows} caption="Daily time-in and time-out records" empty="No attendance was recorded this month." />
      </Card>}

      {isApprovedRevision&&dtrPolicy.includeVerifiedAdjustments!==false&&<p className="mt-4 text-sm text-muted">Supervisor-verified hours: {formatHours(verifiedHours)}</p>}
      {isApprovedRevision&&(dtrPolicy.signatureFields??[]).length>0&&<div className="mt-8 grid gap-6 sm:grid-cols-2">{dtrPolicy.signatureFields.map((label)=><div key={label} className="border-t border-line pt-2 text-xs text-muted">{label}</div>)}</div>}

      {snapshot.flags.length > 0 && (
        <Card title={`Flagged attendance (${snapshot.flags.length})`} className="mt-6">
          <ul className="space-y-1 text-sm">
            {snapshot.flags.map((f) => (
              <li key={`${f.sessionId}-${f.status}`}>
                <span className="font-medium">{formatPolicyDate(f.date)}</span>
                <span className="text-muted">: {f.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
