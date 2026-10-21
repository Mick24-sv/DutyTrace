import AppFooter from './AppFooter.jsx';

// Centered message for loading / fatal states outside the app shell.
export default function FullPageMessage({ tone = 'neutral', children }) {
  const color = tone === 'error' ? 'text-bad-fg' : 'text-muted';
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="flex flex-1 items-center justify-center px-6">
        <p role={tone === 'error' ? 'alert' : 'status'} className={`text-sm ${color}`}>
          {children}
        </p>
      </div>
      <AppFooter context="DutyTrace" />
    </div>
  );
}
