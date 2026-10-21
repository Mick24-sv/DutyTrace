export default function Card({ title, action, children, className = '', as: Tag = 'section' }) {
  return (
    <Tag className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex flex-col items-start justify-between gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-3.5">
          {title && <h2 className="min-w-0 text-sm font-semibold text-navy">{title}</h2>}
          {action && <div className="max-w-full shrink-0 text-sm">{action}</div>}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </Tag>
  );
}
