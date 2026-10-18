import { useEffect, useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

// A confirmation that also asks for text (a response, a reason, a decision) and optionally a date.
// `error` is the server's message, shown inside the dialog so the person can fix it and try again.
export default function NoteDialog({
  open, title, intro, label, required = true, confirmLabel, busy, error, onCancel, onConfirm, dateLabel, dateDefault, dateMax,
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(dateDefault ?? '');
  useEffect(() => { if (open) { setText(''); setDate(dateDefault ?? ''); } }, [open, dateDefault]);

  return (
    <ConfirmDialog
      open={open} title={title} confirmLabel={confirmLabel} busy={busy}
      confirmDisabled={(required && text.trim() === '') || (dateLabel && !date)}
      onCancel={onCancel} onConfirm={() => onConfirm(text.trim(), date)}
    >
      {intro && <p className="mb-3">{intro}</p>}
      <label htmlFor="note-dialog-text" className="mb-1 block text-xs font-medium text-ink">{label}{required ? '' : ' (optional)'}</label>
      <textarea
        id="note-dialog-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      />
      {dateLabel && (
        <div className="mt-3">
          <label htmlFor="note-dialog-date" className="mb-1 block text-xs font-medium text-ink">{dateLabel}</label>
          <input
            id="note-dialog-date" type="date" value={date} max={dateMax} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
    </ConfirmDialog>
  );
}
