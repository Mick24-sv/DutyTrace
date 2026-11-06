import { useEffect, useRef, useId } from 'react';
import Button from './Button.jsx';

// Modal confirmation built on the native <dialog> element: it traps focus,
// closes on Escape, and is announced to screen readers by the browser.
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', busy = false, confirmDisabled = false, onConfirm, onCancel }) {
  const ref = useRef(null);
  const titleId=useId();

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
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-ink/50"
    >
      <div className="min-w-0 p-4 sm:p-6">
        <h2 id={titleId} className="break-words text-base font-semibold text-navy">{title}</h2>
        <div className="mt-2 min-w-0 break-words text-sm text-muted">{children}</div>
      </div>
        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-surface p-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
    </dialog>
  );
}
