import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { apiPost } from '../../services/api.js';
import Button from '../../components/ui/Button.jsx';
import FullPageMessage from '../../components/layout/FullPageMessage.jsx';
import AppFooter from '../../components/layout/AppFooter.jsx';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [verifyState, setVerifyState] = useState('loading'); // 'loading' | 'valid' | 'invalid'
  const [maskedEmail, setMaskedEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Pre-flight: verify token before showing the form.
  useEffect(() => {
    if (!token) {
      setVerifyState('invalid');
      return;
    }
    let cancelled = false;
    // Keep the bearer token out of API URLs and replace the browser history
    // entry after capturing it from the emailed link.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
    apiPost('/auth/reset-password/verify', { token })
      .then((data) => {
        if (!cancelled) {
          setMaskedEmail(data?.maskedEmail ?? '');
          setVerifyState('valid');
        }
      })
      .catch(() => {
        if (!cancelled) setVerifyState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err) {
      if (err.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (err.details) {
        setFieldErrors(err.details);
        setError('');
      } else {
        setError(err.message ?? 'Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  if (verifyState === 'loading') {
    return <FullPageMessage>Verifying reset link…</FullPageMessage>;
  }

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
          <h1 className="text-2xl font-bold text-ink">Set a new password</h1>
          {verifyState === 'valid' && maskedEmail && (
            <p className="mt-2 text-sm text-muted">
              Resetting password for <strong>{maskedEmail}</strong>
            </p>
          )}
        </div>

        <div className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card">
          {verifyState === 'invalid' ? (
            <InvalidState />
          ) : success ? (
            <SuccessState />
          ) : (
            <form onSubmit={onSubmit} noValidate>
              {error && (
                <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                  {error}
                </p>
              )}

              <PasswordField
                id="password"
                label="New password"
                value={password}
                onChange={setPassword}
                error={fieldErrors.password}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirm"
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                error={fieldErrors.confirm}
                autoComplete="new-password"
              />

              <p className="mb-4 text-xs text-muted">
                Password must be at least 10 characters.
              </p>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set new password'}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-muted">
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

function InvalidState() {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-bad-bg px-4 py-3">
        <span className="mt-0.5 text-bad-fg" aria-hidden="true">✕</span>
        <p className="text-sm text-bad-fg">
          This password reset link is invalid or has expired. Reset links are single-use and expire
          after 30 minutes.
        </p>
      </div>
      <Link to="/forgot-password">
        <Button className="w-full">Request a new reset link</Button>
      </Link>
    </div>
  );
}

function SuccessState() {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-ok-bg px-4 py-3">
        <span className="mt-0.5 text-ok-fg" aria-hidden="true">✓</span>
        <p className="text-sm text-ok-fg">
          Your password has been updated successfully. You can now sign in with your new password.
        </p>
      </div>
      <Link to="/login">
        <Button className="w-full">Go to sign in</Button>
      </Link>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, error, autoComplete }) {
  const [show, setShow] = useState(false);

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-lg border border-line bg-surface px-3 py-2 pr-10 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal${
            error ? ' border-bad-fg' : ''
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          aria-label={show ? 'Hide password' : 'Show password'}
          title={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none focus-visible:text-teal"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-bad-fg">
          {error}
        </p>
      )}
    </div>
  );
}
