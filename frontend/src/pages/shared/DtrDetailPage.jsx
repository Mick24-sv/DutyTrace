import {FileText as UIActionFileText,Send as UIActionSend,RefreshCw as UIActionRefreshCw,ClipboardCheck as UIActionClipboardCheck,CheckCircle2 as UIActionCheckCircle2,Undo2 as UIActionUndo2} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DtrDocument from '../../components/dtr/DtrDocument.jsx';
import DtrHistory from '../../components/dtr/DtrHistory.jsx';
import DtrStatusBadge from '../../components/dtr/DtrStatusBadge.jsx';
import DutyTimeEditor from '../../components/attendance/DutyTimeEditor.jsx';
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
  const [editingSession, setEditingSession] = useState(null);
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [verifiedHours, setVerifiedHours] = useState('');
  const [creditDate, setCreditDate] = useState('');
  const [creditScope, setCreditScope] = useState('month');

  const { data: dtr, loading, error } = useApiData(`/dtrs/${id}?${revision ? `revision=${revision}&` : ''}_=${tick}`);
  const latestAttendance = useApiData(dtr?.supervisorEditing && user.role==='supervisor'
    ? `/attendance/users/${dtr.student.id}?month=${dtr.month}&refresh=${tick}` : null);
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

  const savedSnap = dtr.revision.snapshot;
  const live=latestAttendance.data;
  const snap=dtr.supervisorEditing && live && dtr.revision.number===dtr.currentRevision ? {...savedSnap,days:live.days,
    totals:{...savedSnap.totals,...live.totals,requiredHours:savedSnap.totals.requiredHours,remainingHours:Math.max(0,savedSnap.totals.requiredHours-live.totals.recordedHours)},
    flags:live.days.flatMap(day=>day.sessions.filter(s=>!s.counted).map(s=>({sessionId:s.id,date:day.date,status:s.status,message:s.status.replaceAll('_',' ')})))} : savedSnap;
  const isCurrent = dtr.revision.number === dtr.currentRevision;
  const isOwner = user.role === 'student' && dtr.student.id === user.id;
  const isReviewer = user.role === 'supervisor';
  const flagged = snap.totals.incompleteCount;
  const pdfHref = apiUrl(`/dtrs/${dtr.id}/pdf?revision=${dtr.revision.number}`);
  const corrections = dtr.correctionRequests ?? [];
  const pending = corrections.filter(item=>['open','explanation_submitted','under_review'].includes(item.status));

  return (
    <>
      <Link to={back.to} className="mb-4 inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-teal shadow-sm transition-colors hover:border-teal/40 hover:bg-teal/5 active:bg-teal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 sm:px-4">
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" /> {back.label}
      </Link>
      <PageHeader icon={UIActionFileText}
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
      {editingSession && <DutyTimeEditor requestOnly={isOwner} studentId={dtr.student.id} dtrId={dtr.id} session={editingSession} timezone={snap.timezone}
        onClose={()=>setEditingSession(null)} onSaved={()=>{setEditingSession(null);setCorrectionMessage(isOwner?'Correction sent to your supervisor. Your hours have not changed yet.':'Duty time corrected. The student has been notified. Set the final verified monthly hours when your review is complete.');setTick(value=>value+1);}} />}
      {dtr.supervisorEditing && <section className="mb-4 rounded-lg bg-info-bg p-4 text-sm text-info-fg"><b>{isOwner?'Your supervisor is correcting this DTR':'Supervisor editing is active'}</b><p className="mt-1">{dtr.supervisorEditNotice}</p><p className="mt-2">{isOwner?'Please wait while your supervisor corrects the record and confirms the verified monthly hours. You will be notified when it is approved.':'Edit the duty times below, resolve any pending student proposals, then set the verified monthly hours. You can complete this review without returning the DTR to the student.'}</p>
        {isReviewer && latestAttendance.loading && <p role="status" className="mt-2">Loading latest attendance…</p>}
        {isReviewer && latestAttendance.error && <p role="alert" className="mt-2">{latestAttendance.error}</p>}
      </section>}
      {correctionMessage && <p role="status" className="mb-4 rounded-lg bg-info-bg p-3 text-sm text-info-fg">{correctionMessage}</p>}
      {corrections.length>0 && <section className="mb-5 rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-navy">Duty-time correction requests</h2>
        <p className="mt-1 text-sm text-muted">{pending.length} awaiting review. Review corrections before approving this DTR.</p>
        <ul className="mt-3 space-y-2">{corrections.map(item=><li key={item.id} className="rounded-lg bg-canvas p-3 text-sm">
          <Link to={`/${user.role}/discrepancies?discrepancyId=${encodeURIComponent(item.id)}`} className="font-medium text-teal underline">{item.status.replaceAll('_',' ')} — view correction</Link>
          <p className="mt-1 break-words text-muted">{item.reason}</p>
        </li>)}</ul>
      </section>}
      {dtr.correctionRegenerationRequired && !dtr.supervisorEditing && <p role="status" className="mb-4 rounded-lg bg-warn-bg p-3 text-sm text-warn-fg">A time correction was approved after this draft was generated. {isOwner ? 'Regenerate the DTR from latest attendance and resubmit. If it is under review, ask your supervisor to return it first.' : 'Return this DTR for correction, or take over editing to verify the latest records yourself.'}</p>}

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
        <>
        {isOwner && dtr.status === 'draft' && <p className="mb-3 text-sm text-muted">Step 2 of 2: your draft is saved. Select Submit for review to send it to your office supervisor. Hours become verified after approval.</p>}
        <div className="no-print mb-6 flex flex-wrap gap-2">
          {isOwner && (dtr.status === 'draft' || dtr.status === 'needs_correction') && (
            <>
              <Button icon={UIActionSend} onClick={() => setDialog('submit')} disabled={busy}>Submit for review</Button>
              <Button icon={UIActionRefreshCw} variant="secondary" disabled={busy} onClick={() => run('/dtrs', { month: dtr.month })}>
                Regenerate from latest attendance
              </Button>
            </>
          )}
          {isReviewer && dtr.status === 'submitted' && (
            <Button icon={UIActionClipboardCheck} variant="accent" disabled={busy} onClick={() => run(`/dtrs/${dtr.id}/start-review`)}>Start review</Button>
          )}
          {isReviewer && dtr.status === 'under_review' && (
            <>
              {dtr.supervisorEditing ? <Button icon={UIActionCheckCircle2} disabled={busy || pending.length>0 || latestAttendance.loading || !!latestAttendance.error} onClick={()=>{setVerifiedHours(String(snap.totals.recordedHours));setCreditDate(snap.days[0]?.date??`${dtr.month}-01`);setDialog('verify-month');}}>Set verified hours & approve</Button> : <>
                <Button icon={UIActionCheckCircle2} onClick={() => setDialog('approve')} disabled={busy || pending.length>0 || dtr.correctionRegenerationRequired}>Approve</Button>
                <Button variant="secondary" onClick={()=>setDialog('take-over')} disabled={busy}>I will edit this DTR</Button>
              </>}
              <Button icon={UIActionUndo2} variant="secondary" onClick={() => setDialog('return')} disabled={busy}>Return for correction</Button>
            </>
          )}
        </div>
        </>
      )}

      <DtrDocument
        snapshot={snap}
        verifiedHours={dtr.originalVerifiedHours ?? dtr.verifiedHours}
        isApprovedRevision={dtr.status === 'approved' && dtr.verifiedRevision === dtr.revision.number}
        onRequestCorrection={isCurrent && ((isOwner&&!dtr.supervisorEditing)||(isReviewer&&dtr.supervisorEditing&&live&&!latestAttendance.loading)) ? setEditingSession : undefined}
        pendingSessionIds={isOwner ? pending.map(item=>item.sessionId) : []}
      />

      <div className="mt-6">
        <DtrHistory dtr={dtr} timezone={snap.timezone} selectedRevision={dtr.revision.number} onSelectRevision={setRevision} />
      </div>

      <ConfirmDialog
        open={dialog==='take-over'} title="Notify the student and take over editing" confirmLabel="Notify student & start editing" busy={busy}
        confirmDisabled={reason.trim().length<5} onCancel={closeDialog} onConfirm={()=>run(`/dtrs/${dtr.id}/take-over`,{reason})}>
        <label className="block text-sm">Message to the student<textarea value={reason} maxLength={1000} rows={3} onChange={e=>setReason(e.target.value)} className="mt-2 w-full rounded-lg border border-line p-3" placeholder="I will check and correct your duty times against the office log, then confirm your verified hours." /></label>
        <p className="mt-2 text-xs text-muted">The student receives this message and waits for your decision. Original records and earlier revisions are preserved.</p>
      </ConfirmDialog>
      <ConfirmDialog open={dialog==='verify-month'} title={`Verify ${formatMonth(dtr.month)} duty hours`} confirmLabel="Approve verified hours" busy={busy}
        confirmDisabled={!ack||verifiedHours===''||!Number.isFinite(Number(verifiedHours))||Number(verifiedHours)<0||Number(verifiedHours)>744||reason.trim().length<5||(creditScope==='date'&&!creditDate)}
        onCancel={closeDialog} onConfirm={()=>run(`/dtrs/${dtr.id}/verify-edited-month`,{verifiedHours:Number(verifiedHours),creditScope,...(creditScope==='date'?{effectiveDate:creditDate}:{}),reason,acknowledgeIncomplete:ack})}>
        <div className="space-y-3">
          <p>Latest recorded attendance: <b>{snap.totals.recordedHours.toFixed(2)} h</b>. Enter the monthly DTR hours you have verified. Historical paper-DTR credits are counted separately.</p>
          <label className="block text-sm">Verified monthly hours<input type="number" min="0" max="744" step="0.01" value={verifiedHours} onChange={e=>setVerifiedHours(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line p-3" /></label>
          <label className="block text-sm">Verification period<select value={creditScope} onChange={e=>setCreditScope(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface p-3"><option value="month">Whole month — {formatMonth(dtr.month)}</option><option value="date">Specific duty credit date</option></select></label>
          {creditScope==='month' ? <p className="rounded-lg bg-info-bg p-3 text-sm text-info-fg">These hours cover all of {formatMonth(dtr.month)} and count toward the student's assigned semester covering that month. If the month crosses a term boundary, choose a specific date instead.</p> : <label className="block text-sm">Duty credit date<input type="date" min={`${dtr.month}-01`} max={new Date(Date.UTC(Number(dtr.month.slice(0,4)),Number(dtr.month.slice(5,7)),0)).toISOString().slice(0,10)} value={creditDate} onChange={e=>setCreditDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line p-3" /><span className="mt-1 block text-xs text-muted">These verified hours count toward the semester containing this date.</span></label>}
          <label className="block text-sm">Verification explanation and reference<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-line p-3" placeholder="Explain your final hours and identify the office log or official record you checked." /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1" /><span>I verified these hours against supporting records, reviewed flagged sessions, and excluded duplicate historical credits. Approval locks this DTR.</span></label>
        </div>
      </ConfirmDialog>
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
