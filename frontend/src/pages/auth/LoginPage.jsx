import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import Button from '../../components/ui/Button.jsx';
import FullPageMessage from '../../components/layout/FullPageMessage.jsx';

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (user) return <Navigate to={ROLE_CONFIG[user.role].base} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      const signedIn = await login(email, password);
      const base = ROLE_CONFIG[signedIn.role].base;
      // Return to the page they tried to open, but only if it belongs to their role.
      const from = location.state?.from;
      navigate(from?.startsWith(base) ? from : base, { replace: true });
    } catch (err) {
      setFieldErrors(err.details ?? {});
      setError(err.details ? '' : err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <img src="/logo.png" alt="DutyTrace Logo" className="h-9 w-9 rounded-full bg-white object-contain p-0.5 shadow-sm" />
          <span className="text-xl font-semibold tracking-tight text-white">DutyTrace</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-10">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="DutyTrace Logo"
            className="mx-auto mb-3 h-28 w-28 rounded-2xl border border-line bg-surface object-contain p-2 shadow-sm"
          />
          <h1 className="text-2xl font-bold text-ink">Sign in to DutyTrace</h1>
          <p className="mt-2 text-sm text-muted">
            Student Assistant duty verification and compliance tracking.
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card">
          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">
              {error}
            </p>
          )}

          <Field
            id="email" label="Email" type="email" autoComplete="username"
            value={email} onChange={setEmail} error={fieldErrors.email}
          />
          <Field
            id="password" label="Password" type="password" autoComplete="current-password"
            value={password} onChange={setPassword} error={fieldErrors.password}
          />

          <div className="mb-3 -mt-2 text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-teal hover:underline focus:outline-none focus-visible:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

      </main>
    </div>
  );
}

function Field({ id, label, type, value, onChange, error, autoComplete }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={effectiveType}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal ${
            isPassword ? 'pr-10' : ''
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none focus-visible:text-teal"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-bad-fg">{error}</p>}
    </div>
  );
}
