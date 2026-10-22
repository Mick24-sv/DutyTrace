import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DocumentList from '../../components/records/DocumentList.jsx';
import UploadControl from '../../components/records/UploadControl.jsx';
import Timeline from '../../components/records/Timeline.jsx';
import NoteDialog from '../../components/records/NoteDialog.jsx';
import ReceiptForm from '../../components/records/ReceiptForm.jsx';
import { CaseStatusBadge } from '../../components/records/StatusBadges.jsx';
import { CASE_STATUS } from '../../components/records/labels.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatDateKey, formatDateRange, formatDateTime, todayKey } from '../../utils/format.js';

const BACK = { student: '/student/cases', supervisor: '/supervisor/cases', admin: '/admin/cases' };

// Dialogs that ask for text. `field` is the JSON key the API expects.
const TEXT_DIALOGS = {
  submit: { path: 'submit', field: 'message', title: 'Submit this case for review?', label: 'Message for the reviewer', required: false, confirm: 'Submit for review',
    intro: 'All requested documents are attached. After you submit, an administrator reviews the case.' },
  respond: { path: 'respond', field: 'message', title: 'Answer the correction request', label: 'What did you correct or add?', required: true, confirm: 'Send response' },
  request_correction: { path: 'request-correction', field: 'note', title: 'Ask the student for a correction?', label: 'What needs to be corrected?', required: true, confirm: 'Request correction' },
  resolve: { path: 'resolve', field: 'decision', title: 'Resolve this case', label: 'Final decision', required: true, confirm: 'Resolve case', date: true,
    intro: 'Record the decision in your own words. The decision is shown to the student and kept in the history.' },
  reopen: { path: 'reopen', field: 'reason', title: 'Reopen this case?', label: 'Why is it being reopened?', required: true, confirm: 'Reopen' },
  close: { path: 'close', field: 'note', title: 'Close this case?', label: 'Why is it being closed?', required: true, confirm: 'Close case',
    intro: 'A closed case is final and can no longer be changed.' },
  add_note: { path: 'notes', field: 'note', title: 'Add a note', label: 'Note', required: true, confirm: 'Add note',
    intro: 'Notes are added to the case history. They cannot be edited afterwards.' },
  add_requirement: { path: 'requirements', field: 'label', title: 'Request another document', label: 'Name of the document', required: true, confirm: 'Add requirement' },
  waive: { path: null, field: 'reason', title: 'Waive this requirement?', label: 'Why is it waived?', required: true, confirm: 'Waive requirement',
    intro: 'The student will no longer need to provide this document. The reason is kept in the history.' },
};

// One compliance case: requirements, documents, decision, history and the actions this person may take.
// Buttons follow the server's `actions` list; the API enforces permissions again on every request.
export default function CaseDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const { data: c, loading, error } = useApiData(`/cases/${id}?_=${tick}`);
  const [dialog, setDialog] = useState(null); // { name, requirementId? }
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [actionError, setActionError] = useState('');
  const reload = () => setTick((t) => t + 1);
  const closeDialog = () => { setDialog(null); setDialogError(''); };

  async function post(path, body) {
    setBusy(true); setDialogError(''); setActionError('');
    try {
      await apiPost(`/cases/${id}/${path}`, body);
      closeDialog(); reload();
    } catch (err) {
      const msg = err.details && !Array.isArray(err.details?.missing) ? Object.values(err.details).join(' ') : err.message;
      if (dialog) setDialogError(msg); else setActionError(msg);
    } finally { setBusy(false); }
  }

  if (loading) return <p role="status" className="text-sm text-muted">Loading case…</p>;
  if (error || !c) {
    return (
      <>
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error ?? 'Case not found.'}</p>
        <Link to={BACK[user.role]} className="mt-4 inline-block text-sm font-medium text-teal underline">Back</Link>
      </>
    );
  }

  const can = (x) => c.actions.includes(x);
  const spec = dialog ? TEXT_DIALOGS[dialog.name] : null;
  const lastCorrection = [...c.history].reverse().find((e) => e.action === 'correction_requested');
  const today = todayKey(c.timezone);

  function confirmText(text, date) {
    if (dialog.name === 'waive') return post(`requirements/${dialog.requirementId}/waive`, { reason: text });
    const body = { [spec.field]: text || undefined };
    if (spec.date) body.resolutionDate = date;
    return post(spec.path, body);
  }

  return (
    <>
      <Link to={BACK[user.role]} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Compliance Cases
      </Link>
      <PageHeader title={`${c.reference}: ${c.type.name}`} description={`${c.student.fullName} · ${c.office.name} · ${formatDateRange(c.periodStart, c.periodEnd)}`}>
        <CaseStatusBadge status={c.status} />
      </PageHeader>

      {actionError && <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{actionError}</p>}
      {c.status === 'needs_correction' && lastCorrection && (
        <p role="status" className="mb-4 rounded-card bg-bad-bg px-4 py-3 text-sm text-bad-fg"><strong>Correction requested:</strong> {lastCorrection.note}</p>
      )}
      {(c.status === 'resolved' || c.status === 'closed') && c.decision && (
        <div role="status" className="mb-4 rounded-card bg-ok-bg px-4 py-3 text-sm text-ok-fg">
          <p><strong>Decision{c.resolutionDate ? ` (${formatDateKey(c.resolutionDate)})` : ''}:</strong></p>
          <p className="whitespace-pre-line">{c.decision}</p>
          <p className="mt-1 text-xs">Recorded by {c.resolvedBy}{c.resolvedAt ? `, ${formatDateTime(c.resolvedAt, c.timezone)}` : ''}.</p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {can('submit') && <Button onClick={() => setDialog({ name: 'submit' })} disabled={c.missingRequirements > 0} title={c.missingRequirements > 0 ? 'Upload every requested document first' : undefined}>Submit for review</Button>}
        {can('respond') && <Button onClick={() => setDialog({ name: 'respond' })} disabled={c.missingRequirements > 0}>Respond to correction request</Button>}
        {can('start_review') && <Button variant="accent" onClick={() => setDialog({ name: 'start_review' })}>Start review</Button>}
        {can('request_correction') && <Button variant="secondary" onClick={() => setDialog({ name: 'request_correction' })}>Request correction</Button>}
        {can('resolve') && <Button onClick={() => setDialog({ name: 'resolve' })}>Resolve</Button>}
        {can('reopen') && <Button variant="secondary" onClick={() => setDialog({ name: 'reopen' })}>Reopen</Button>}
        {can('add_note') && <Button variant="secondary" onClick={() => setDialog({ name: 'add_note' })}>Add note</Button>}
        {can('close') && <Button variant="secondary" onClick={() => setDialog({ name: 'close' })}>Close case</Button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="About this case">
          <p className="whitespace-pre-line text-sm">{c.description}</p>
          <p className="mt-3 text-xs text-muted">Opened by {c.createdBy} · {formatDateTime(c.createdAt, c.timezone)}</p>
        </Card>

        <Card title="Requested documents">
          {c.requirements.length === 0 && <p className="text-sm text-muted">No documents are requested for this case.</p>}
          <ul className="divide-y divide-line">
            {c.requirements.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-navy">
                    {r.satisfied ? <CheckCircle2 className="h-4 w-4 text-ok-fg" aria-label="Provided" /> : <Circle className="h-4 w-4 text-muted" aria-label="Still needed" />}
                    {r.label}
                  </p>
                  <span className="text-xs text-muted">
                    {r.waived ? 'Waived' : r.docCount > 0 ? `${r.docCount} provided` : 'Still needed'}
                  </span>
                </div>
                {r.waived && <p className="mt-1 text-xs text-muted">Waived by {r.waivedBy}: {r.waivedReason}</p>}
                {can('upload') && !r.waived && (
                  <div className="mt-2"><UploadControl id={`req-upload-${r.id}`} label={`Upload for “${r.label}”`} path={`/cases/${c.id}/documents`} query={`&requirementId=${r.id}`} onUploaded={reload} /></div>
                )}
                {can('waive') && !r.waived && !r.satisfied && (
                  <button type="button" className="mt-2 text-xs font-medium text-teal underline" onClick={() => setDialog({ name: 'waive', requirementId: r.id })}>Waive this requirement</button>
                )}
              </li>
            ))}
          </ul>
          {can('add_requirement') && (
            <button type="button" className="mt-3 text-sm font-medium text-teal underline" onClick={() => setDialog({ name: 'add_requirement' })}>Request another document</button>
          )}
        </Card>
      </div>

      <Card title="Documents" className="mt-6">
        <DocumentList documents={c.documents} timezone={c.timezone} requirements={c.requirements} />
        {can('upload') && (
          <div className="mt-4 border-t border-line pt-4">
            <UploadControl id="case-upload" label="Upload another document" path={`/cases/${c.id}/documents`} onUploaded={reload} />
          </div>
        )}
      </Card>

      {can('record_receipt') && (
        <Card title="Record something received by email or in person" className="mt-6">
          <ReceiptForm path={`/cases/${c.id}/receipts`} timezone={c.timezone} requirements={c.requirements} onSaved={reload} />
        </Card>
      )}

      <div className="mt-6"><Timeline history={c.history} timezone={c.timezone} statusLabels={CASE_STATUS} /></div>

      <ConfirmDialog
        open={dialog?.name === 'start_review'} title="Start reviewing this case?" confirmLabel="Start review" busy={busy}
        onCancel={closeDialog} onConfirm={() => post('start-review')}
      >
        The case moves to “Under review”. The student can no longer change it until you ask for a correction or resolve it.
        {dialogError && <span role="alert" className="mt-3 block rounded-lg bg-bad-bg px-3 py-2 text-bad-fg">{dialogError}</span>}
      </ConfirmDialog>

      <NoteDialog
        open={Boolean(spec)} title={spec?.title} intro={spec?.intro} label={spec?.label ?? ''} required={spec?.required ?? true}
        confirmLabel={spec?.confirm} busy={busy} error={dialogError}
        dateLabel={spec?.date ? 'Resolution date' : undefined} dateDefault={today} dateMax={today}
        onCancel={closeDialog} onConfirm={confirmText}
      />
    </>
  );
}
