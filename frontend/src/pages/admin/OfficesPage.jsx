import { useState } from 'react';
import { Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiPut } from '../../services/api.js';

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
  const [search, setSearch] = useState('');
  const [capacityValues, setCapacityValues] = useState({});
  const [capacityBusy, setCapacityBusy] = useState('');
  const filteredOffices = (data?.offices ?? []).filter((office) => [office.code, office.name, office.isActive ? 'active' : 'inactive']
    .some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase())));

  async function create(e) {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      await apiPost('/offices', { code, name });
      setCode(''); setName(''); setTick((t) => t + 1);
    } catch (err) { setFormError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  async function saveCapacity(office) {
    setCapacityBusy(office.id); setFormError('');
    try {
      await apiPut(`/offices/${office.id}/schedule-capacity`, { scheduleCapacity: Number(capacityValues[office.id] ?? office.scheduleCapacity) });
      setTick((t) => t + 1);
    } catch (err) { setFormError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setCapacityBusy(''); }
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
        {data && (
          <>
            <label htmlFor="office-search" className="sr-only">Search offices</label>
            <div className="relative mb-3 w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="office-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search offices" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
            </div>
            <div className="hidden sm:block">
              <DataTable columns={columns} rows={filteredOffices} caption="Offices" empty={search ? 'No matching offices.' : 'No offices yet. Add the first one above.'} />
            </div>
            <div className="mt-4 space-y-2">
              <h2 className="text-sm font-semibold">Schedule staffing capacity</h2>
              <p className="text-xs text-muted">Maximum Student Assistants assigned to overlapping shifts in each office. Back-to-back shifts do not overlap.</p>
              {filteredOffices.map((office) => <div key={office.id} className="rounded-lg border border-line p-3">
                <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{office.code} · {office.name}</p></div>
                  <Badge tone={office.isActive ? 'approved' : 'rejected'}>{office.isActive ? 'active' : 'inactive'}</Badge>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <label className="min-w-0 text-xs text-muted">Students per overlapping slot
                    <input aria-label={`${office.name} schedule capacity`} type="number" min="1" max="500" className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink" value={capacityValues[office.id] ?? office.scheduleCapacity} onChange={(event) => setCapacityValues((current) => ({ ...current, [office.id]: event.target.value }))} />
                  </label>
                  <Button className="min-w-16" disabled={capacityBusy === office.id || Number(capacityValues[office.id] ?? office.scheduleCapacity) < 1} onClick={() => saveCapacity(office)}>{capacityBusy === office.id ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>)}
            </div>
            {filteredOffices.length === 0 && <p className="py-5 text-center text-sm text-muted">{search ? 'No matching offices.' : 'No offices yet. Add the first one above.'}</p>}
          </>
        )}
      </Card>
    </>
  );
}
