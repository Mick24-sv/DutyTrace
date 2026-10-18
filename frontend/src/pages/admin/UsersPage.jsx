import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPatch, apiPost, apiPut } from '../../services/api.js';
import { ROLE_CONFIG } from '../../routes/navConfig.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';

// Administrators create accounts, assign people to offices and enable/disable accounts.
export default function UsersPage() {
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useApiData(`/users?_=${tick}`);
  const offices = useApiData('/offices');
  const [form, setForm] = useState({ email: '', fullName: '', role: 'student', password: '', officeId: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowError, setRowError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reload = () => setTick((t) => t + 1);
  const officeList = offices.data?.offices ?? [];

  async function create(e) {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      await apiPost('/users', { ...form, officeId: form.role === 'admin' || !form.officeId ? undefined : form.officeId });
      setForm({ email: '', fullName: '', role: 'student', password: '', officeId: '' });
      reload();
    } catch (err) { setFormError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  async function act(fn) {
    setRowError('');
    try { await fn(); reload(); } catch (err) { setRowError(err.message); }
  }

  const columns = [
    { key: 'fullName', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (u) => ROLE_CONFIG[u.role].label },
    {
      key: 'office', header: 'Office',
      render: (u) => (u.role === 'admin' ? '—' : (
        <select
          aria-label={`Office for ${u.fullName}`} value={u.office?.id ?? ''} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
          onChange={(e) => act(() => apiPut(`/users/${u.id}/assignment`, { officeId: e.target.value || null }))}
        >
          <option value="">Not assigned</option>
          {officeList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )),
    },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.status === 'active' ? 'approved' : 'rejected'}>{u.status}</Badge> },
    {
      key: 'action', header: '',
      render: (u) => (
        <button
          type="button" className="text-sm font-medium text-teal underline"
          onClick={() => act(() => apiPatch(`/users/${u.id}`, { status: u.status === 'active' ? 'disabled' : 'active' }))}
        >
          {u.status === 'active' ? 'Disable' : 'Enable'}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Users & Roles" description="Create accounts, assign people to offices and enable or disable access." />
      <Card title="Create an account" className="mb-6">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="mb-1 block text-xs font-medium text-muted">Full name</label>
            <input id="u-name" value={form.fullName} onChange={set('fullName')} required className={field} />
          </div>
          <div>
            <label htmlFor="u-email" className="mb-1 block text-xs font-medium text-muted">Email</label>
            <input id="u-email" type="email" value={form.email} onChange={set('email')} required className={field} />
          </div>
          <div>
            <label htmlFor="u-role" className="mb-1 block text-xs font-medium text-muted">Role</label>
            <select id="u-role" value={form.role} onChange={set('role')} className={field}>
              {Object.entries(ROLE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="u-office" className="mb-1 block text-xs font-medium text-muted">Office</label>
            <select id="u-office" value={form.officeId} onChange={set('officeId')} disabled={form.role === 'admin'} className={field}>
              <option value="">Not assigned</option>
              {officeList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="u-pass" className="mb-1 block text-xs font-medium text-muted">Temporary password (at least 10 characters)</label>
            <input id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={10} className={field} />
            <p className="mt-1 text-xs text-muted">Tell the person their password privately. There is no password-reset flow yet.</p>
          </div>
          {formError && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{formError}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button></div>
        </form>
      </Card>
      <Card>
        {loading && <p role="status" className="text-sm text-muted">Loading users…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {rowError && <p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{rowError}</p>}
        {data && <DataTable columns={columns} rows={data.users} caption="Users" empty="No users yet." />}
      </Card>
    </>
  );
}
