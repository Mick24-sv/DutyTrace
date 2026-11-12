import {FileText as UIActionFileText} from 'lucide-react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, Target } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatHours, formatMonth } from '../../utils/format.js';

// Student Assistant: my ended months, preview a month, generate its DTR, open existing ones.
export default function MyDtrPage() {
  const { data, loading, error } = useApiData('/dtrs/mine');
  const monthAction = (row) => {
    const status = row.dtr?.status;
    const label = !row.dtr ? 'Prepare DTR' : status === 'draft' ? 'Continue draft' : status === 'needs_correction' ? 'Review corrections' : 'View DTR';
    const to = row.dtr ? '/student/dtr/' + row.dtr.id : '/student/dtr/preview/' + row.month;
    return <Link data-tutorial="dtr-action" to={to} aria-label={label + ' for ' + formatMonth(row.month)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal hover:bg-canvas">{label}</Link>;
  };

  const columns = [
    { key: 'month', header: 'Month', render: (r) => <span className="font-medium">{formatMonth(r.month)}</span> },
    { key: 'status', header: 'Status', render: (r) => (r.dtr ? <DtrStatusBadge status={r.dtr.status} /> : <span className="text-muted">Not generated</span>) },
    { key: 'recorded', header: 'Recorded', render: (r) => (r.dtr ? formatHours(r.dtr.recordedHours) : '—') },
    { key: 'verified', header: 'Verified', render: (r) => (r.dtr?.verifiedHours != null ? formatHours(r.dtr.verifiedHours) : <span className="text-muted">Not verified</span>) },
    { key: 'historical', header: 'Historical verified', render: (r) => formatHours(r.historicalHours) },
    {
      key: 'action', header: 'Next step',
      render: monthAction,
    },
  ];

  return (
    <>
      <PageHeader icon={UIActionFileText}
        title="Monthly DTR"
        description={data ? `A DTR can be created once a month has ended (${data.timezone}). It is built from your saved QR attendance.` : undefined}
      />
      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Supervisor-verified hours" value={formatHours(data.verifiedHoursTotal)} hint={`From ${data.approvedCount} approved DTR(s) only`} icon={ShieldCheck} />
            <StatCard label="Historical verified hours" value={formatHours(data.historicalHoursTotal)} hint="From approved paper DTR credits" icon={ShieldCheck} />
            <StatCard label="Monthly DTR target" value={formatHours(data.policy.requiredMonthlyHours)} hint="Separate from semester duty-hour completion" icon={Target} />
            <StatCard label="DTRs created" value={data.months.filter((m) => m.dtr).length} hint="Last 12 ended months" icon={FileText} />
          </div>

          <Card title="Choose a month" className="mt-6">
            <p className="mb-4 text-sm text-muted">Prepare DTR opens that month’s preview. Continue draft opens your saved document so you can submit it. Submitted DTRs stay available under View DTR while your supervisor reviews them.</p>
            <div className="hidden sm:block">
              <DataTable columns={columns} rows={data.months.map((m) => ({ ...m, id: m.month }))} caption="Monthly DTRs by month" />
            </div>
            <div className="divide-y divide-line sm:hidden">
              {data.months.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">No ended months available yet.</p>
              ) : data.months.map((row) => (
                <article key={row.month} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <h3 className="font-medium text-ink">{formatMonth(row.month)}</h3>
                    {monthAction(row)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted">Status</p>
                      <div className="mt-1">{row.dtr ? <DtrStatusBadge status={row.dtr.status} /> : <span className="text-muted">Not generated</span>}</div>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Recorded</p>
                      <p className="mt-1">{row.dtr ? formatHours(row.dtr.recordedHours) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Verified</p>
                      <p className="mt-1">{row.dtr?.verifiedHours != null ? formatHours(row.dtr.verifiedHours) : <span className="text-muted">Not verified</span>}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Historical verified</p>
                      <p className="mt-1">{formatHours(row.historicalHours)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Card>


        </>
      )}
    </>
  );
}
