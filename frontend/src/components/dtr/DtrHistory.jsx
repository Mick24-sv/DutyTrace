import Card from '../ui/Card.jsx';
import { formatDateTime, formatHours } from '../../utils/format.js';
import { DTR_STATUS_LABEL } from './DtrStatusBadge.jsx';

const ACTION = {
  generated: 'Generated',
  regenerated: 'Regenerated (new revision)',
  submitted: 'Submitted for review',
  review_started: 'Review started',
  approved: 'Approved',
  returned: 'Returned for correction',
};

// Who did what, when - including correction reasons - plus every revision that was ever generated.
export default function DtrHistory({ dtr, timezone, selectedRevision, onSelectRevision }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="History">
        <ol className="space-y-4">
          {dtr.history.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-medium text-navy">
                {ACTION[e.action] ?? e.action}
                <span className="font-normal text-muted"> · revision {e.revision}</span>
              </p>
              <p className="text-muted">
                {e.actor.fullName} ({e.actor.role === 'student' ? 'Student Assistant' : 'Supervisor'}) · {formatDateTime(e.at, timezone)}
              </p>
              {e.fromStatus && (
                <p className="text-xs text-muted">{DTR_STATUS_LABEL[e.fromStatus]} → {DTR_STATUS_LABEL[e.toStatus]}</p>
              )}
              {e.reason && <p className="mt-1 rounded bg-bad-bg px-3 py-2 text-bad-fg">Reason: {e.reason}</p>}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Revisions">
        <ul className="space-y-2">
          {dtr.revisions.map((r) => (
            <li key={r.number} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">Revision {r.number}</span>
                {r.number === dtr.currentRevision && <span className="text-muted"> (current)</span>}
                <span className="block text-xs text-muted">
                  {formatDateTime(r.generatedAt, timezone)} · {formatHours(r.recordedHours)} recorded · {r.incompleteCount} flagged
                </span>
              </span>
              {r.number === selectedRevision ? (
                <span className="text-xs font-medium text-teal">Viewing</span>
              ) : (
                <button type="button" onClick={() => onSelectRevision(r.number)} className="font-medium text-teal underline">
                  View
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Earlier revisions are kept and never edited.</p>
      </Card>
    </div>
  );
}
