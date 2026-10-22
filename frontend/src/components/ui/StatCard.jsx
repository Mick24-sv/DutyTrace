// A small metric tile.
export default function StatCard({ label, value, hint, icon: Icon, compact = false }) {
  return (
    <div className={`h-full min-w-0 rounded-card border border-line bg-surface shadow-card ${compact ? 'p-3 sm:p-5' : 'p-5'}`}>
      <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
        <p className={`${compact ? 'text-xs sm:text-sm' : 'text-sm'} min-w-0 text-muted`}>{label}</p>
        {Icon && <Icon className={`${compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5'} shrink-0 text-teal`} aria-hidden="true" />}
      </div>
      <p className={`${compact ? 'mt-1.5 text-xl sm:mt-2 sm:text-2xl' : 'mt-2 text-2xl'} break-words font-semibold text-navy`}>{value}</p>
      {hint && <p className={`${compact ? 'mt-1 text-[11px] leading-snug sm:text-xs' : 'mt-1 text-xs'} text-muted`}>{hint}</p>}
    </div>
  );
}
