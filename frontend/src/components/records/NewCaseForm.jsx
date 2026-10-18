import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { apiPost } from '../../services/api.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

// Administrator opens a case. Cases are never opened automatically from hours or absence notices.
export default function NewCaseForm({ students, types, onCreated, onCancel }) {
  const [userId, setUserId] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [description, setDescription] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const type = types.find((t) => t.id === caseTypeId);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const created = await apiPost('/cases', { userId, caseTypeId, periodStart, periodEnd, description, requirements: lines(extra) });
      onCreated(created);
    } catch (err) { setError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="case-student" className="mb-1 block text-xs font-medium text-muted">Student Assistant</label>
        <select id="case-student" value={userId} onChange={(e) => setUserId(e.target.value)} required className={field}>
          <option value="">Choose…</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.office ? ` (${s.office.code})` : ''}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="case-type" className="mb-1 block text-xs font-medium text-muted">Case type</label>
        <select id="case-type" value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)} required className={field}>
          <option value="">Choose…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {type && (
          <p className="mt-1 text-xs text-muted">
            {type.requiredDocuments.length ? `Will request: ${type.requiredDocuments.join('; ')}` : 'This type requests no documents by default.'}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="case-start" className="mb-1 block text-xs font-medium text-muted">Period start</label>
        <input id="case-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required className={field} />
      </div>
      <div>
        <label htmlFor="case-end" className="mb-1 block text-xs font-medium text-muted">Period end</label>
        <input id="case-end" type="date" value={periodEnd} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} required className={field} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="case-desc" className="mb-1 block text-xs font-medium text-muted">What is this case about?</label>
        <textarea id="case-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={4000} className={field} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="case-extra" className="mb-1 block text-xs font-medium text-muted">Additional documents to request (one per line, optional)</label>
        <textarea id="case-extra" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} className={field} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open case'}</Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
