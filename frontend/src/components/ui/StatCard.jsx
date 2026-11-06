// A small metric tile.
export default function StatCard({ label, value, hint, icon: Icon, compact = false, className = '', mobileInline = false, hideHintOnMobile = false }) {
  return (
    <div className={`h-full min-w-0 rounded-card border border-line bg-surface shadow-card ${compact ? 'p-3 sm:p-5' : 'p-5'} ${mobileInline?'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:block':''} ${className}`}>
      <div className={`flex min-w-0 items-start gap-2 sm:gap-3 ${mobileInline?'justify-start sm:justify-between':'justify-between'}`}>
        <p className={`${compact ? 'text-xs sm:text-sm' : 'text-sm'} min-w-0 text-muted`}>{label}</p>
        {Icon && <Icon className={`${compact ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5'} shrink-0 text-teal`} aria-hidden="true" />}
      </div>
      <p className={`${mobileInline?'text-sm sm:mt-2 sm:text-2xl':compact ? 'mt-1.5 text-xl sm:mt-2 sm:text-2xl' : 'mt-2 text-2xl'} break-words font-semibold text-navy`}>{value}</p>
      {hint && <p className={`${hideHintOnMobile?'hidden sm:block ':''}${compact ? 'mt-1 text-[11px] leading-snug sm:text-xs' : 'mt-1 text-xs'} text-muted`}>{hint}</p>}
    </div>
  );
}
