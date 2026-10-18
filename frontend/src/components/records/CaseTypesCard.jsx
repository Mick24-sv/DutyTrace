import { useState } from 'react';
import Card from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { apiPatch, apiPost } from '../../services/api.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

// Case types are configured here, not hard-coded: no institution-specific case categories are assumed.
// Changing a type only affects cases opened afterwards; each case keeps the requirements it was opened with.
export default function CaseTypesCard({ types, onChanged }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [docs, setDocs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiPost('/cases/types', { code, name, description: description || undefined, requiredDocuments: lines(docs) });
      setCode(''); setName(''); setDescription(''); setDocs('');
      onChanged();
    } catch (err) { setError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }
  async function toggle(t) {
    setError('');
    try { await apiPatch(`/cases/types/${t.id}`, { isActive: !t.isActive }); onChanged(); } catch (err) { setError(err.message); }
  }

  return (
    <Card title="Case types">
      <p className="mb-4 text-sm text-muted">
        Define the kinds of cases your office handles and which documents each one asks for. Nothing here is preset; configure them to match your institution's policies.
      </p>
      <ul className="mb-6 divide-y divide-line">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium text-navy">{t.name} <span className="font-normal text-muted">({t.code})</span> {!t.isActive && <Badge tone="neutral">Inactive</Badge>}</p>
              {t.description && <p className="text-muted">{t.description}</p>}
              <p className="text-xs text-muted">{t.requiredDocuments.length ? `Requests: ${t.requiredDocuments.join('; ')}` : 'Requests no documents by default.'}</p>
            </div>
            <Button variant="secondary" onClick={() => toggle(t)}>{t.isActive ? 'Deactivate' : 'Reactivate'}</Button>
          </li>
        ))}
        {types.length === 0 && <li className="py-3 text-sm text-muted">No case types yet.</li>}
      </ul>
      <form onSubmit={create} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <h3 className="text-sm font-semibold text-navy sm:col-span-2">Add a case type</h3>
        <div>
          <label htmlFor="type-code" className="mb-1 block text-xs font-medium text-muted">Code</label>
          <input id="type-code" value={code} onChange={(e) => setCode(e.target.value)} required className={field} />
        </div>
        <div>
          <label htmlFor="type-name" className="mb-1 block text-xs font-medium text-muted">Name</label>
          <input id="type-name" value={name} onChange={(e) => setName(e.target.value)} required className={field} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="type-desc" className="mb-1 block text-xs font-medium text-muted">Description (optional)</label>
          <input id="type-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="type-docs" className="mb-1 block text-xs font-medium text-muted">Documents requested (one per line)</label>
          <textarea id="type-docs" rows={2} value={docs} onChange={(e) => setDocs(e.target.value)} className={field} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Add case type'}</Button></div>
      </form>
    </Card>
  );
}
