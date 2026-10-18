import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';

const columns = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Office' },
  {
    key: 'isActive',
    header: 'Status',
    render: (o) => <Badge tone={o.isActive ? 'approved' : 'rejected'}>{o.isActive ? 'active' : 'inactive'}</Badge>,
  },
];

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';

export default function OfficesPage() {
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useApiData(`/offices?_=${tick}`);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      await apiPost('/offices', { code, name });
      setCode(''); setName(''); setTick((t) => t + 1);
    } catch (err) { setFormError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Offices" description="Offices where Student Assistants and supervisors are assigned." />
      <Card title="Add an office" className="mb-6">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="office-code" className="mb-1 block text-xs font-medium text-muted">Code</label>
            <input id="office-code" value={code} onChange={(e) => setCode(e.target.value)} required className={field} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="office-name" className="mb-1 block text-xs font-medium text-muted">Name</label>
            <input id="office-name" value={name} onChange={(e) => setName(e.target.value)} required className={field} />
          </div>
          {formError && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-3">{formError}</p>}
          <div className="sm:col-span-3"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add office'}</Button></div>
        </form>
      </Card>
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading offices…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {data && <DataTable columns={columns} rows={data.offices} caption="Offices" empty="No offices yet. Add the first one above." />}
      </Card>
    </>
  );
}
