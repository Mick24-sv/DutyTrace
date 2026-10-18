import { FileDown, Mail } from 'lucide-react';
import { apiUrl } from '../../services/api.js';
import { formatDateKey, formatDateTime, formatFileSize } from '../../utils/format.js';

// Files are never linked directly. Each link goes through the API, which checks who is asking every time.
// Manual receipts (an email or in-person hand-in recorded by staff) have no file; they show who recorded them and when.
export default function DocumentList({ documents, timezone, requirements }) {
  if (documents.length === 0) return <p className="text-sm text-muted">No documents yet.</p>;
  const reqLabel = (id) => requirements?.find((r) => r.id === id)?.label;
  return (
    <ul className="divide-y divide-line">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
          <div className="min-w-0">
            {d.hasFile ? (
              <a
                href={apiUrl(`/documents/${d.id}/download`)}
                className="inline-flex items-center gap-2 break-all font-medium text-teal underline"
              >
                <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" /> {d.fileName}
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 font-medium text-navy">
                <Mail className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                Received {d.method === 'email' ? 'by email' : 'in person'} on {formatDateKey(d.receivedDate)}
              </span>
            )}
            <p className="text-xs text-muted">
              {d.hasFile
                ? `${formatFileSize(d.sizeBytes)} · uploaded by ${d.submittedBy}`
                : `Recorded by ${d.submittedBy}${d.receivedBy ? ` · received by ${d.receivedBy.fullName}` : ''} · no file attached`}
              {' · '}{formatDateTime(d.submittedAt, timezone)}
            </p>
            {reqLabel(d.requirementId) && <p className="text-xs text-muted">For: {reqLabel(d.requirementId)}</p>}
            {d.notes && <p className="mt-1 text-muted">{d.notes}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
