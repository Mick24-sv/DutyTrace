import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../../services/api.js';
import Button from '../../components/ui/Button.jsx';
import AppFooter from '../../components/layout/AppFooter.jsx';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState(null);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await apiPost('/auth/forgot-password', { email });
      setEmailConfigured(data?.emailConfigured !== false);
      // In dev mode the server returns a devResetUrl for convenience.
      if (data?.devResetUrl) setDevResetUrl(data.devResetUrl);
      setSubmitted(true);
    } catch (err) {
      if (err.status === 429) {
        setError('Too many requests. Please wait a few minutes and try again.');
      } else {
        setError(err.message ?? 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-navy px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <img src="/logo.png" alt="DutyTrace Logo" className="h-9 w-9 rounded-full bg-white object-contain p-0.5 shadow-sm" />
          <span className="text-xl font-semibold tracking-tight text-white">DutyTrace</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="DutyTrace Logo"
            className="mx-auto mb-3 h-28 w-28 rounded-2xl border border-line bg-surface object-contain p-2 shadow-sm"
          />
          <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your registered email and we&apos;ll send you a reset link.
          </p>
        </div>

        <div className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card">
          {submitted ? (
            <SuccessState devResetUrl={devResetUrl} emailConfigured={emailConfigured} />
          ) : (
            <form onSubmit={onSubmit} noValidate>
              {error && (
                <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                  {error}
                </p>
              )}

              <div className="mb-4">
                <label htmlFor="email" className="mb-1 block text-sm font-medium">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="you@example.com"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-muted">
            Remembered your password?{' '}
            <Link to="/login" className="text-teal hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
      <AppFooter context="DutyTrace" />
    </div>
  );
}

function SuccessState({ devResetUrl, emailConfigured }) {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-ok-bg px-4 py-3">
        <span className="mt-0.5 text-ok-fg" aria-hidden="true">✓</span>
        <p className="text-sm text-ok-fg">
          {devResetUrl
            ? 'Email delivery is not configured. Use the development-only reset link below.'
            : emailConfigured
              ? 'If an active account matches this address and email delivery succeeds, reset instructions will arrive. Check your inbox and spam folder.'
              : 'Email-based password recovery is unavailable, and no reset link was created. Contact your institution administrator to confirm its approved recovery process.'}
        </p>
      </div>
      {(emailConfigured || devResetUrl) && (
        <p className="text-sm text-muted">
          A delivered reset link expires in <strong>30 minutes</strong>. If no message arrives, the email service may be unavailable.
        </p>
      )}

      {devResetUrl && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
            🔧 Development only — not shown in production
          </p>
          <p className="mb-2 text-xs text-amber-700">
            No email provider is configured. Use this link to test the reset flow:
          </p>
          <a
            href={devResetUrl}
            className="break-all text-xs font-mono text-teal underline hover:text-navy"
          >
            {devResetUrl}
          </a>
        </div>
      )}
    </div>
  );
}
