import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { apiPost } from '../../services/api.js';
import { todayKey } from '../../utils/format.js';

// Staff record that something arrived by email or in person. DutyTrace does not read any mailbox:
// this is a manual note of what was received, and no file is attached to it.
export default function ReceiptForm({ path, timezone, requirements, onSaved }) {
  const today = todayKey(timezone);
  const [method, setMethod] = useState('email');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiPost(path, { method, receivedDate: date, notes: notes.trim() || undefined, requirementId: requirementId || undefined });
      setNotes(''); setRequirementId('');
      onSaved();
    } catch (err) { setError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  const field = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="receipt-method" className="mb-1 block text-xs font-medium text-muted">How was it received?</label>
        <select id="receipt-method" value={method} onChange={(e) => setMethod(e.target.value)} className={`${field} w-full`}>
          <option value="email">By email</option>
          <option value="in_person">In person</option>
        </select>
      </div>
      <div>
        <label htmlFor="receipt-date" className="mb-1 block text-xs font-medium text-muted">Date received</label>
        <input id="receipt-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required className={`${field} w-full`} />
      </div>
      {requirements && (
        <div className="sm:col-span-2">
          <label htmlFor="receipt-req" className="mb-1 block text-xs font-medium text-muted">Which requested document? (optional)</label>
          <select id="receipt-req" value={requirementId} onChange={(e) => setRequirementId(e.target.value)} className={`${field} w-full`}>
            <option value="">Not tied to a requirement</option>
            {requirements.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      )}
      <div className="sm:col-span-2">
        <label htmlFor="receipt-notes" className="mb-1 block text-xs font-medium text-muted">Notes (optional)</label>
        <textarea id="receipt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className={`${field} w-full`} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Record receipt'}</Button>
        <p className="mt-1 text-xs text-muted">This only records that something was received. Nothing is attached or read from any mailbox.</p>
      </div>
    </form>
  );
}
