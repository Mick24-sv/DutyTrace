import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import DocumentList from '../../components/records/DocumentList.jsx';
import UploadControl from '../../components/records/UploadControl.jsx';
import Timeline from '../../components/records/Timeline.jsx';
import NoteDialog from '../../components/records/NoteDialog.jsx';
import ReceiptForm from '../../components/records/ReceiptForm.jsx';
import { AbsenceStatusBadge } from '../../components/records/StatusBadges.jsx';
import { ABSENCE_STATUS, ABSENCE_TYPE } from '../../components/records/labels.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatDateRange, formatDateTime } from '../../utils/format.js';

const BACK = { student: '/student/absences', supervisor: '/supervisor/absences', admin: '/admin' };

// One absence notice. Buttons come from the server's `actions` list; the API enforces them again on every request.
export default function AbsenceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const { data: a, loading, error } = useApiData(`/absences/${id}?_=${tick}`);
  const [dialog, setDialog] = useState(null); // 'acknowledge' | 'review' | 'follow_up' | 'respond'
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const reload = () => setTick((t) => t + 1);

  const DIALOGS = {
    acknowledge: { path: 'acknowledge', title: 'Acknowledge this notice?', label: 'Message to the student', required: false, confirm: 'Acknowledge',
      intro: 'Acknowledging tells the student you have seen the notice. It does not excuse the absence.' },
    review: { path: 'review', title: 'Mark this notice as reviewed?', label: 'Response to the student', required: true, confirm: 'Mark reviewed',
      intro: 'A reviewed notice is finished on the supervisor side. It does not excuse the absence or change required hours.' },
    follow_up: { path: 'follow-up', title: 'Ask the student for more information?', label: 'What do you need from the student?', required: true, confirm: 'Request follow-up' },
    respond: { path: 'respond', title: 'Answer the follow-up request', label: 'Your answer', required: true, confirm: 'Send answer', field: 'message' },
  };

  async function run(text) {
    const d = DIALOGS[dialog];
    setBusy(true); setDialogError('');
    try {
      await apiPost(`/absences/${id}/${d.path}`, d.field === 'message' ? { message: text } : { response: text || undefined });
      setDialog(null); reload();
    } catch (err) { setDialogError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  if (loading) return <p role="status" className="text-sm text-muted">Loading notice…</p>;
  if (error || !a) {
    return (
      <>
        <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error ?? 'Notice not found.'}</p>
        <Link to={BACK[user.role]} className="mt-4 inline-block text-sm font-medium text-teal underline">Back</Link>
      </>
    );
  }
  const can = (x) => a.actions.includes(x);
  const d = dialog ? DIALOGS[dialog] : null;

  return (
    <>
      <Link to={BACK[user.role]} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Absence Notices
      </Link>
      <PageHeader title={`${ABSENCE_TYPE[a.type]}: ${formatDateRange(a.startDate, a.endDate)}`} description={`${a.student.fullName} · ${a.office.name}`}>
        <AbsenceStatusBadge status={a.status} />
      </PageHeader>

      <p className="mb-4 rounded-card bg-canvas px-4 py-3 text-sm text-muted">
        This notice does not excuse the absence or reduce required duty hours. Its status only shows how far the review has gone.
      </p>

      {a.status === 'needs_follow_up' && a.response && (
        <p role="status" className="mb-4 rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg"><strong>Follow-up requested:</strong> {a.response}</p>
      )}

      {(can('acknowledge') || can('review') || can('follow_up') || can('respond')) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {can('acknowledge') && <Button variant="secondary" onClick={() => setDialog('acknowledge')}>Acknowledge</Button>}
          {can('review') && <Button onClick={() => setDialog('review')}>Mark reviewed</Button>}
          {can('follow_up') && <Button variant="secondary" onClick={() => setDialog('follow_up')}>Request follow-up</Button>}
          {can('respond') && <Button onClick={() => setDialog('respond')}>Answer follow-up request</Button>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Notice">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted">Submitted</dt><dd>{formatDateTime(a.submittedAt, a.timezone)}</dd></div>
            <div><dt className="text-xs text-muted">Reason</dt><dd className="whitespace-pre-line">{a.reason}</dd></div>
            <div>
              <dt className="text-xs text-muted">Supervisor response</dt>
              <dd className="whitespace-pre-line">{a.response ?? <span className="text-muted">No response yet.</span>}</dd>
              {a.respondedBy && <dd className="text-xs text-muted">{a.respondedBy} · {formatDateTime(a.respondedAt, a.timezone)} · status: {ABSENCE_STATUS[a.status].label}</dd>}
            </div>
          </dl>
        </Card>

        <Card title="Supporting documents">
          <DocumentList documents={a.documents} timezone={a.timezone} />
          {can('upload') && (
            <div className="mt-4 border-t border-line pt-4">
              <UploadControl id="absence-upload" path={`/absences/${a.id}/documents`} onUploaded={reload} />
            </div>
          )}
        </Card>
      </div>

      {can('record_receipt') && (
        <Card title="Record something received by email or in person" className="mt-6">
          <ReceiptForm path={`/absences/${a.id}/receipts`} timezone={a.timezone} onSaved={reload} />
        </Card>
      )}

      <div className="mt-6"><Timeline history={a.history} timezone={a.timezone} statusLabels={ABSENCE_STATUS} /></div>

      <NoteDialog
        open={Boolean(dialog)} title={d?.title} intro={d?.intro} label={d?.label ?? ''} required={d?.required ?? true}
        confirmLabel={d?.confirm} busy={busy} error={dialogError}
        onCancel={() => { setDialog(null); setDialogError(''); }} onConfirm={run}
      />
    </>
  );
}
