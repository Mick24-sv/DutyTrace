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
  const history = [...dtr.history].reverse();
  const revisions = [...dtr.revisions].sort((a, b) => b.number - a.number);
  const scrollArea = 'max-h-80 overflow-y-auto overscroll-contain pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal lg:max-h-96';
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card title="History" className="min-w-0 overflow-hidden" action={<span className="text-xs text-muted">{history.length} events · newest first</span>}>
        <div className={scrollArea} tabIndex={0} role="region" aria-label="DTR history, newest first">
        <ol className="divide-y divide-line">
          {history.map((e) => (
            <li key={e.id} className="min-w-0 py-3 text-sm first:pt-0 last:pb-0">
              <p className="font-medium text-navy">
                {e.action === 'review_started' && e.reason?.startsWith('[Supervisor editing] ') ? 'Supervisor took over editing' : ACTION[e.action] ?? e.action}
                <span className="font-normal text-muted"> · revision {e.revision}</span>
              </p>
              <p className="mt-1 break-words text-xs text-muted">
                {e.actor.fullName} ({e.actor.role === 'student' ? 'Student Assistant' : 'Supervisor'})
              </p>
              <time dateTime={e.at} className="block text-xs text-muted">{formatDateTime(e.at, timezone)}</time>
              {e.fromStatus && e.fromStatus !== e.toStatus && (
                <p className="mt-1 text-xs text-muted">{DTR_STATUS_LABEL[e.fromStatus]} → {DTR_STATUS_LABEL[e.toStatus]}</p>
              )}
              {e.reason && <details className={`mt-2 rounded-lg px-3 ${e.action === 'returned' ? 'bg-bad-bg text-bad-fg' : 'bg-canvas text-ink'}`}>
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                  <span className="shrink-0 font-medium">View note</span>
                  <span className="min-w-0 truncate text-muted">{e.reason.replace(/^\[Supervisor editing\] /, '')}</span>
                </summary>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words pb-3 text-sm [overflow-wrap:anywhere]">{e.reason.replace(/^\[Supervisor editing\] /, '')}</p>
              </details>}
            </li>
          ))}
        </ol>
        {!history.length && <p className="text-sm text-muted">No history yet.</p>}
        </div>
      </Card>

      <Card title="Revisions" className="min-w-0 overflow-hidden" action={<span className="text-xs text-muted">{revisions.length} saved</span>}>
        <div className={scrollArea} tabIndex={0} role="region" aria-label="Saved DTR revisions, newest first">
        <ul className="divide-y divide-line">
          {revisions.map((r) => (
            <li key={r.number} className="flex items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
              <span className="min-w-0 break-words">
                <span className="font-medium">Revision {r.number}</span>
                {r.number === dtr.currentRevision && <span className="text-muted"> (current)</span>}
                <span className="mt-1 block text-xs text-muted">
                  {formatDateTime(r.generatedAt, timezone)}
                </span>
                <span className="block text-xs text-muted">
                  {formatHours(r.recordedHours)} recorded · {r.incompleteCount} flagged
                </span>
              </span>
              {r.number === selectedRevision ? (
                <span aria-current="true" className="shrink-0 rounded-md bg-info-bg px-2 py-1 text-xs font-medium text-info-fg">Viewing</span>
              ) : (
                <button type="button" onClick={() => onSelectRevision(r.number)} aria-label={`View revision ${r.number}`} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                  View
                </button>
              )}
            </li>
          ))}
        </ul>
        {!revisions.length && <p className="text-sm text-muted">No saved revisions.</p>}
        </div>
        <p className="mt-3 text-xs text-muted">Earlier revisions are kept and never edited.</p>
      </Card>
    </div>
  );
}
