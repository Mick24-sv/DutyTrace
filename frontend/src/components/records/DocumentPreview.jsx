import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../services/api.js';

export default function DocumentPreview({ document, onClose }) {
  const dialog = useRef(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current.showModal();
    const controller = new AbortController();
    let objectUrl;
    let active = true;
    async function load() {
      try {
        const response = await fetch(apiUrl(`/documents/${document.id}/view`), {
          credentials: 'include', signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Unable to load this document.');
        }
        const blob = await response.blob();
        if (!active) return;
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(blob.type)) {
          throw new Error('This file type cannot be previewed.');
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        if (active && err.name !== 'AbortError') setError(err.message);
      }
    }
    load();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id]);

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="document-preview-title"
      className="m-auto w-[95vw] max-w-5xl rounded-xl border border-line bg-surface p-4 text-ink backdrop:bg-black/50">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="document-preview-title" className="break-all font-medium">{document.fileName}</h2>
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-2">Close</button>
      </div>
      {error ? <p role="alert" className="text-bad-fg">{error}</p> : !url ? <p role="status">Loading document…</p> :
        document.mimeType === 'application/pdf' ? (
          <iframe src={url} title={document.fileName} className="h-[75vh] w-full border-0" />
        ) : (
          <img src={url} alt={document.fileName} className="mx-auto max-h-[75vh] max-w-full object-contain" />
        )}
    </dialog>
  );
}
