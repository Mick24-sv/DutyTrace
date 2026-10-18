import { useEffect, useRef } from 'react';
import Button from './Button.jsx';

// Modal confirmation built on the native <dialog> element: it traps focus,
// closes on Escape, and is announced to screen readers by the browser.
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', busy = false, confirmDisabled = false, onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      aria-labelledby="confirm-title"
      className="m-auto w-full max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-ink/50"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-base font-semibold text-navy">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
