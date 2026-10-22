import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DtrDocument from '../../components/dtr/DtrDocument.jsx';
import DtrHistory from '../../components/dtr/DtrHistory.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiUrl } from '../../services/api.js';
import { formatMonth } from '../../utils/format.js';

const BACK = {
  student: { to: '/student/dtr', label: 'Monthly DTR' },
  supervisor: { to: '/supervisor/dtr-review', label: 'DTR Review' },
  admin: { to: '/admin/dtrs', label: 'DTR Overview' },
};

// One DTR: the document, its history and the actions this person may take.
// The buttons are a convenience; the API enforces who may do what.
export default function DtrDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [revision, setRevision] = useState(null);
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null); // 'submit' | 'approve' | 'return'
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const { data: dtr, loading, error } = useApiData(`/dtrs/${id}?${revision ? `revision=${revision}&` : ''}_=${tick}`);
  const back = BACK[user.role];

  const closeDialog = () => { setDialog(null); setAck(false); setReason(''); setReasonError(''); };

  async function run(path, body) {
    setBusy(true); setActionError('');
    try {
      await apiPost(path, body);
      closeDialog(); setRevision(null); setTick((t) => t + 1);
    } catch (err) {
      if (err.details?.reason) setReasonError(err.details.reason);
      else { setActionError(err.message); closeDialog(); }
    } finally { setBusy(false); }
  }

  if (loading) return <p role="status" className="text-sm text-muted">Loading DTR…</p>;
  if (error || !dtr) {
    return (
      <>
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error ?? 'DTR not found.'}</p>
        <Link to={back.to} className="mt-4 inline-block text-sm font-medium text-teal underline">Back to {back.label}</Link>
      </>
    );
  }

  const snap = dtr.revision.snapshot;
  const isCurrent = dtr.revision.number === dtr.currentRevision;
  const isOwner = user.role === 'student' && dtr.student.id === user.id;
  const isReviewer = user.role === 'supervisor';
  const flagged = dtr.revision.snapshot.totals.incompleteCount;
  const pdfHref = apiUrl(`/dtrs/${dtr.id}/pdf?revision=${dtr.revision.number}`);

  return (
    <>
      <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back.label}
      </Link>
      <PageHeader
        title={`${formatMonth(dtr.month)} DTR`}
        description={`${dtr.student.fullName} · ${dtr.office.name}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DtrStatusBadge status={dtr.status} />
          <a
            href={pdfHref} download
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Download PDF
          </a>
        </div>
      </PageHeader>

      {actionError && <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{actionError}</p>}

      {dtr.status === 'needs_correction' && dtr.latestReturnReason && (
        <p role="status" className="mb-4 rounded-card bg-bad-bg px-4 py-3 text-sm text-bad-fg">
          <strong>Returned for correction:</strong> {dtr.latestReturnReason}
        </p>
      )}
      {dtr.status === 'approved' && (
        <p role="status" className="mb-4 rounded-card bg-ok-bg px-4 py-3 text-sm text-ok-fg">
          Approved. Effective verified hours (revision {dtr.verifiedRevision}): <strong>{dtr.verifiedHours.toFixed(2)} h</strong>. This record is locked.
          {dtr.adjusted&&<> An approved attendance adjustment of {dtr.adjustmentHours.toFixed(2)} h is linked separately; the finalized DTR snapshot remains unchanged.</>}
        </p>
      )}
      {!isCurrent && (
        <p role="status" className="mb-4 rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          You are viewing superseded revision {dtr.revision.number}.{' '}
          <button type="button" className="font-medium underline" onClick={() => setRevision(null)}>Back to the current revision</button>
        </p>
      )}

      {isCurrent && (
        <div className="no-print mb-6 flex flex-wrap gap-2">
          {isOwner && (dtr.status === 'draft' || dtr.status === 'needs_correction') && (
            <>
              <Button onClick={() => setDialog('submit')} disabled={busy}>Submit for review</Button>
              <Button variant="secondary" disabled={busy} onClick={() => run('/dtrs', { month: dtr.month })}>
                Regenerate from latest attendance
              </Button>
            </>
          )}
          {isReviewer && dtr.status === 'submitted' && (
            <Button variant="accent" disabled={busy} onClick={() => run(`/dtrs/${dtr.id}/start-review`)}>Start review</Button>
          )}
          {isReviewer && dtr.status === 'under_review' && (
            <>
              <Button onClick={() => setDialog('approve')} disabled={busy}>Approve</Button>
              <Button variant="secondary" onClick={() => setDialog('return')} disabled={busy}>Return for correction</Button>
            </>
          )}
        </div>
      )}

      <DtrDocument
        snapshot={snap}
        verifiedHours={dtr.originalVerifiedHours ?? dtr.verifiedHours}
        isApprovedRevision={dtr.status === 'approved' && dtr.verifiedRevision === dtr.revision.number}
      />

      <div className="mt-6">
        <DtrHistory dtr={dtr} timezone={snap.timezone} selectedRevision={dtr.revision.number} onSelectRevision={setRevision} />
      </div>

      <ConfirmDialog
        open={dialog === 'submit'} title="Submit this DTR for review?" confirmLabel="Submit" busy={busy}
        onCancel={closeDialog} onConfirm={() => run(`/dtrs/${dtr.id}/submit`)}
      >
        Your supervisor will review revision {dtr.currentRevision}. You will not be able to change it while it is under review.
        {flagged > 0 && <> It has {flagged} flagged session(s) that are not counted.</>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'approve'} title="Approve this DTR?" confirmLabel="Approve" busy={busy} confirmDisabled={flagged > 0 && !ack}
        onCancel={closeDialog} onConfirm={() => run(`/dtrs/${dtr.id}/approve`, { acknowledgeIncomplete: ack })}
      >
        <p>
          Approving verifies <strong>{snap.totals.recordedHours.toFixed(2)} h</strong> and locks the record. This cannot be undone.
        </p>
        {flagged > 0 && (
          <label className="mt-3 flex items-start gap-2 text-ink">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
            <span>
              {flagged} flagged session(s) are NOT counted and will not be verified. I understand, and I am approving only the counted hours.
            </span>
          </label>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'return'} title="Return for correction" confirmLabel="Return to student" busy={busy}
        onCancel={closeDialog} onConfirm={() => (reason.trim() ? run(`/dtrs/${dtr.id}/return`, { reason }) : setReasonError('Tell the student what to correct.'))}
      >
        <label htmlFor="return-reason" className="mb-1 block font-medium text-ink">Reason (required)</label>
        <textarea
          id="return-reason" rows={4} maxLength={1000} value={reason}
          onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
          aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? 'return-reason-error' : undefined}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        {reasonError && <p id="return-reason-error" role="alert" className="mt-1 text-bad-fg">{reasonError}</p>}
      </ConfirmDialog>
    </>
  );
}
