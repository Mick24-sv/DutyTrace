export default function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
      {Icon && <Icon className="h-9 w-9 text-teal" aria-hidden="true" />}
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <div className="mt-1 max-w-md text-sm text-muted">{children}</div>
    </div>
  );
}
