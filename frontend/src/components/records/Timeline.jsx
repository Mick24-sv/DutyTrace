import Card from '../ui/Card.jsx';
import { formatDateTime } from '../../utils/format.js';
import { EVENT_LABEL, ROLE_NAME } from './labels.js';

// Append-only history: who did what and when, including the notes and reasons they gave.
export default function Timeline({ history, timezone, statusLabels }) {
  return (
    <Card title="History">
      <ol className="space-y-4">
        {history.map((e) => (
          <li key={e.id} className="text-sm">
            <p className="font-medium text-navy">{EVENT_LABEL[e.action] ?? e.action}</p>
            <p className="text-muted">{e.actor.fullName} ({ROLE_NAME[e.actor.role]}) · {formatDateTime(e.at, timezone)}</p>
            {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
              <p className="text-xs text-muted">{statusLabels[e.fromStatus]?.label} → {statusLabels[e.toStatus]?.label}</p>
            )}
            {e.note && <p className="mt-1 whitespace-pre-line rounded bg-canvas px-3 py-2 text-ink">{e.note}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">History is kept permanently and cannot be edited.</p>
    </Card>
  );
}
