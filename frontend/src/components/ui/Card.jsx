export default function Card({ title, action, children, className = '', as: Tag = 'section' }) {
  return (
    <Tag className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-navy">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </Tag>
  );
}
