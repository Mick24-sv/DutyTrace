const VARIANTS = {
  primary: 'bg-navy text-white hover:bg-navy/90',
  accent: 'bg-teal text-white hover:bg-teal/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
};

export default function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
