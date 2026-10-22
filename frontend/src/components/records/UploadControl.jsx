import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { apiUpload } from '../../services/api.js';

// Picks one PDF/PNG/JPEG and sends it as the raw request body. The server checks the real file type and
// size; whatever it answers is shown here. `query` (e.g. "&requirementId=...") ties it to a requested document.
export default function UploadControl({ path, query = '', label = 'Upload a document', onUploaded, id }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true); setError('');
    try {
      await apiUpload(path, file, query);
      setFile(null);
      if (input.current) input.current.value = '';
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id} ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }}
          className="max-w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm"
        />
        <Button variant="accent" onClick={send} disabled={!file || busy}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">PDF, PNG or JPEG only. Uploaded files are private and cannot be removed once sent.</p>
      {error && <p role="alert" className="mt-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
    </div>
  );
}
