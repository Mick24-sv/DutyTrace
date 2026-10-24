import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, total, pageSize = 7, onPageChange, disabled = false, label = 'Pagination', recordLabel = 'Records' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  const buttonClass = 'inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <p role="status" className="w-full text-center text-xs text-muted sm:w-auto sm:text-left">
        {recordLabel} {start} to {end} of {total}
        <span className="ml-2">Page {page} of {totalPages}</span>
      </p>
      <div className="flex w-full justify-between gap-2 sm:w-auto">
        <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Previous
        </button>
        <button type="button" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)} className={buttonClass}>
          Next <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
