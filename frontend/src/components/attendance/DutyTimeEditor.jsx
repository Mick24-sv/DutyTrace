import { useEffect, useRef, useState } from 'react';
import { apiPost } from '../../services/api.js';

function localInput(value, timezone) {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function toIso(value, timezone) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const local = localInput(new Date(instant).toISOString(), timezone);
    instant += target - Date.parse(`${local}Z`);
  }
  const iso = new Date(instant).toISOString();
  if (localInput(iso, timezone) !== `${date}T${time.length === 5 ? `${time}:00` : time}`) {
    throw new Error('This local time does not exist in the institution timezone. Choose another time.');
  }
  return iso;
}

export default function DutyTimeEditor({ studentId, session, timezone, onClose, onSaved, dtrId, requestOnly = false }) {
  const dialog = useRef(null);
  const [start, setStart] = useState(localInput(session?.timeIn, timezone));
  const [end, setEnd] = useState(localInput(session?.timeOut, timezone));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  const save = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const timeIn = toIso(start, timezone);
      const timeOut = toIso(end, timezone);
      if (new Date(timeOut) <= new Date(timeIn)) throw new Error('Clock-out must be later than clock-in.');
      await apiPost(requestOnly ? '/attendance-discrepancies/student-correction' : '/attendance-discrepancies/supervisor-correction', {
        ...(requestOnly ? {dtrId} : {studentId,...(dtrId?{dtrId}:{})}), ...(session ? { sessionId: session.id, originalTimeIn: session.timeIn, originalTimeOut: session.timeOut } : {}),
        events: [{ eventType: 'time_in', recordedAt: timeIn }, { eventType: 'time_out', recordedAt: timeOut }],
        remarks: reason.trim(),
      });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const field = 'mt-1 block w-full rounded-lg border border-line bg-surface p-3 text-sm text-ink';
  return <dialog ref={dialog} aria-labelledby="duty-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-4 text-ink backdrop:bg-black/40 sm:p-5">
    <form onSubmit={save} className="space-y-4">
      <h2 id="duty-editor-title" className="text-lg font-semibold text-navy">{requestOnly ? 'Propose corrected duty time' : session ? 'Edit duty time' : 'Add missed duty'}</h2>
      <p className="text-sm text-muted">{requestOnly ? `Enter the times you actually worked in ${timezone}. Your supervisor must approve this request before any hours change. Original QR scans are preserved.` : `Enter the times actually worked in ${timezone}. Hours are calculated from these times. Your reason and original record are kept in the correction history, and the student is notified.`}</p>
      <label className="block text-sm">Clock-in<input autoFocus required type="datetime-local" step="1" value={start} onChange={e => setStart(e.target.value)} className={field} disabled={busy} /></label>
      <label className="block text-sm">Clock-out<input required type="datetime-local" step="1" value={end} onChange={e => setEnd(e.target.value)} className={field} disabled={busy} /></label>
      <label className="block text-sm">Reason for correction<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className={field} rows={3} disabled={busy} /></label>
      <p className="text-xs text-muted">{requestOnly ? 'Hours are calculated from clock-in and clock-out. Explain why the QR record needs correction. After approval, an unapproved DTR must be regenerated to include the corrected times.' : 'For an approved DTR, this creates a tracked hours adjustment. The approved document retains its original snapshot. Unapproved DTRs may need regeneration.'}</p>
      {error && <p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={busy || !reason.trim()} className="min-h-11 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : requestOnly ? 'Send for supervisor review' : 'Save duty time'}</button>
      </div>
    </form>
  </dialog>;
}
