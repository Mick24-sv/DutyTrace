import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, ShieldCheck, Target } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import DtrDocument from '../../components/dtr/DtrDocument.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatHours, formatMonth } from '../../utils/format.js';

// Student Assistant: my ended months, preview a month, generate its DTR, open existing ones.
export default function MyDtrPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useApiData('/dtrs/mine');
  const [month, setMonth] = useState(null);
  const preview = useApiData(month ? `/dtrs/preview?month=${month}` : null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState('');

  async function generate() {
    setBusy(true); setGenError('');
    try {
      const dtr = await apiPost('/dtrs', { month });
      navigate(dtr.id);
    } catch (err) {
      setGenError(err.message);
    } finally { setBusy(false); }
  }

  const columns = [
    { key: 'month', header: 'Month', render: (r) => <span className="font-medium">{formatMonth(r.month)}</span> },
    { key: 'status', header: 'Status', render: (r) => (r.dtr ? <DtrStatusBadge status={r.dtr.status} /> : <span className="text-muted">Not generated</span>) },
    { key: 'recorded', header: 'Recorded', render: (r) => (r.dtr ? formatHours(r.dtr.recordedHours) : '—') },
    { key: 'verified', header: 'Verified', render: (r) => (r.dtr?.verifiedHours != null ? formatHours(r.dtr.verifiedHours) : <span className="text-muted">Not verified</span>) },
    { key: 'historical', header: 'Historical verified', render: (r) => formatHours(r.historicalHours) },
    {
      key: 'action', header: '',
      render: (r) => (r.dtr ? (
        <Link to={r.dtr.id} className="font-medium text-teal underline">Open</Link>
      ) : (
        <button type="button" onClick={() => { setMonth(r.month); setGenError(''); }} className="font-medium text-teal underline">Preview &amp; create</button>
      )),
    },
  ];

  return (
    <>
      <PageHeader
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

          <Card title="Last 12 months" className="mt-6">
            <div className="hidden sm:block">
              <DataTable columns={columns} rows={data.months.map((m) => ({ ...m, id: m.month }))} caption="Monthly DTRs by month" />
            </div>
            <div className="divide-y divide-line sm:hidden">
              {data.months.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">No ended months available yet.</p>
              ) : data.months.map((row) => (
                <article key={row.month} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-ink">{formatMonth(row.month)}</h3>
                    {row.dtr ? (
                      <Link to={row.dtr.id} className="shrink-0 font-medium text-teal underline">Open</Link>
                    ) : (
                      <button type="button" onClick={() => { setMonth(row.month); setGenError(''); }} className="shrink-0 text-right text-sm font-medium text-teal underline">Preview &amp; create</button>
                    )}
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

          {month && (
            <Card title={`Preview: ${formatMonth(month)}`} className="mt-6">
              {preview.loading && <p role="status" className="text-sm text-muted">Loading preview…</p>}
              {preview.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{preview.error}</p>}
              {preview.data && (
                <>
                  <DtrDocument snapshot={preview.data} />
                  {genError && <p role="alert" className="mt-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{genError}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button onClick={generate} disabled={busy}>{busy ? 'Creating…' : `Create ${formatMonth(month)} DTR`}</Button>
                    <Button variant="secondary" onClick={() => setMonth(null)} disabled={busy}>Close preview</Button>
                    <span className="text-xs text-muted">Creating saves a draft. You can submit it afterwards.</span>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
