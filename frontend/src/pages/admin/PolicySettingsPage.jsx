import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPut } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

// Administrator: policy values that ADNU has not confirmed yet. Changing the required hours
// affects DTRs generated AFTER the change; existing revisions keep the value they were made with.
export default function PolicySettingsPage() {
  const { data, loading, error } = useApiData('/dtrs/policy');
  const [policy, setPolicy] = useState(null);
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }

  useEffect(() => { if (data) { setPolicy(data); setHours(String(data.requiredMonthlyHours)); } }, [data]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const updated = await apiPut('/dtrs/policy', { requiredMonthlyHours: Number(hours) });
      setPolicy(updated); setMessage({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err.details?.requiredMonthlyHours ?? err.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Policy Settings" description="Values that ADNU has not confirmed yet. Treat them as placeholders." />
      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {policy && (
        <Card title="Required duty hours" className="max-w-xl">
          <form onSubmit={save} noValidate>
            <label htmlFor="required-hours" className="mb-1 block text-sm font-medium">Required hours per month</label>
            <input
              id="required-hours" type="number" step="0.5" min="0" value={hours} onChange={(e) => setHours(e.target.value)}
              className="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-muted">
              Placeholder: ADNU has not confirmed this number. It applies to DTRs generated after the change; earlier revisions keep their value.
              {policy.updatedBy && <> Last changed by {policy.updatedBy} on {formatDateTime(policy.updatedAt, policy.timezone)}.</>}
            </p>
            {message && (
              <p role={message.ok ? 'status' : 'alert'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}>{message.text}</p>
            )}
            <Button type="submit" className="mt-4" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </form>
        </Card>
      )}
      <Card title="Other settings" className="mt-6 max-w-xl">
        <ul className="space-y-1 text-sm text-muted">
          <li>Time zone: <strong className="text-ink">{policy?.timezone ?? '…'}</strong> (set by APP_TIMEZONE on the server)</li>
          <li>DTR template: <strong className="text-ink">Provisional</strong>, not the official ADNU form</li>
        </ul>
      </Card>
    </>
  );
}
