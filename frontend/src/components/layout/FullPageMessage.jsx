// Centered message for loading / fatal states outside the app shell.
export default function FullPageMessage({ tone = 'neutral', children }) {
  const color = tone === 'error' ? 'text-bad-fg' : 'text-muted';
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <p role={tone === 'error' ? 'alert' : 'status'} className={`text-sm ${color}`}>
        {children}
      </p>
    </div>
  );
}
