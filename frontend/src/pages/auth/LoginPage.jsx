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
    <div className="min-h-screen w-full bg-surface">
      <header className="flex h-[76px] w-full items-center bg-navy px-6 sm:px-10 lg:px-12 xl:px-20">
        <img src="/logo.png" alt="DutyTrace" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-0.5 shadow-sm" />
        <span className="ml-3 text-xl font-semibold tracking-tight text-white">DutyTrace</span>
      </header>

      <main className="grid min-h-[calc(100vh-76px)] w-full bg-surface lg:grid-cols-[minmax(420px,0.95fr)_minmax(420px,1.05fr)]">
        <section className="flex min-h-[calc(100vh-76px)] flex-col px-6 py-7 sm:px-10 lg:px-12 xl:px-20">
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">Welcome back</h1>
              <p className="mt-3 text-base text-muted">Sign in to your DutyTrace account</p>
            </div>

            <form onSubmit={onSubmit} noValidate>
              {error && (
                <p role="alert" className="mb-5 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad-fg">
                  {error}
                </p>
              )}

              <Field
                id="email" label="Email address" type="email" autoComplete="username"
                value={email} onChange={setEmail} error={fieldErrors.email}
              />
              <Field
                id="password" label="Password" type="password" autoComplete="current-password"
                value={password} onChange={setPassword} error={fieldErrors.password}
              />

              <div className="-mt-1 mb-6 text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-teal hover:underline focus:outline-none focus-visible:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="mt-1 min-h-12 w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-muted lg:text-left">Duty hours and attendance, in one place.</p>
        </section>

        <aside className="relative hidden min-h-[calc(100vh-76px)] items-center justify-center overflow-hidden bg-canvas px-8 py-12 lg:flex xl:px-16">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal/5" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-navy/5" aria-hidden="true" />
        <div className="relative w-full max-w-2xl">
          <DutyIllustration />
          <div className="mx-auto mt-8 max-w-lg text-center">
            <h2 className="text-3xl font-bold tracking-tight text-navy">Your duty. Your progress.</h2>
            <p className="mt-3 text-base leading-7 text-muted">
              Track your hours. Stay on schedule. Meet your requirements.
            </p>
          </div>
        </div>
        </aside>
      </main>
    </div>
  );
}

function DutyIllustration() {
  return (
    <svg viewBox="0 0 640 460" role="img" aria-labelledby="duty-illustration-title" className="mx-auto block w-full max-w-xl">
      <title id="duty-illustration-title">Student assistant organizing duty hours on a laptop</title>
      <ellipse cx="320" cy="414" rx="232" ry="20" fill="var(--color-line)" opacity="0.65" />

      <rect x="344" y="51" width="218" height="138" rx="18" fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="2" />
      <rect x="365" y="72" width="40" height="40" rx="12" fill="var(--color-info-bg)" />
      <path d="M385 81v12l8 5" fill="none" stroke="var(--color-navy)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="385" cy="93" r="13" fill="none" stroke="var(--color-navy)" strokeWidth="2.5" />
      <rect x="419" y="78" width="112" height="9" rx="4.5" fill="var(--color-line)" />
      <rect x="419" y="96" width="79" height="7" rx="3.5" fill="var(--color-line)" opacity="0.8" />
      <rect x="365" y="128" width="176" height="42" rx="10" fill="var(--color-canvas)" />
      <rect x="378" y="141" width="82" height="7" rx="3.5" fill="var(--color-teal)" />
      <rect x="378" y="153" width="128" height="5" rx="2.5" fill="var(--color-line)" />
      <circle cx="521" cy="149" r="9" fill="var(--color-ok-bg)" />
      <path d="m517 149 3 3 6-7" fill="none" stroke="var(--color-ok-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="75" y="111" width="128" height="186" rx="16" fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth="2" />
      <rect x="93" y="131" width="91" height="34" rx="9" fill="var(--color-navy)" />
      <rect x="104" y="143" width="52" height="7" rx="3.5" fill="var(--color-surface)" opacity="0.9" />
      <g fill="var(--color-canvas)">
        <rect x="93" y="178" width="25" height="25" rx="6" /><rect x="125" y="178" width="25" height="25" rx="6" /><rect x="157" y="178" width="27" height="25" rx="6" />
        <rect x="93" y="211" width="25" height="25" rx="6" /><rect x="125" y="211" width="25" height="25" rx="6" /><rect x="157" y="211" width="27" height="25" rx="6" />
      </g>
      <g fill="var(--color-teal)">
        <rect x="93" y="244" width="25" height="25" rx="6" /><rect x="125" y="244" width="25" height="25" rx="6" /><rect x="157" y="244" width="27" height="25" rx="6" />
      </g>

      <path d="M207 328c4-64 39-106 104-106s101 42 105 106v60H207z" fill="var(--color-navy)" />
      <path d="M264 210c0-42 20-69 53-69s53 27 53 69v24h-106z" fill="var(--color-ink)" />
      <ellipse cx="317" cy="211" rx="42" ry="51" fill="var(--color-warn-bg)" />
      <path d="M275 207c0-44 19-67 46-67 28 0 47 23 47 63-13-3-22-12-27-24-12 17-36 26-66 28z" fill="var(--color-ink)" />
      <path d="M298 215h1m36 0h1" stroke="var(--color-navy)" strokeWidth="5" strokeLinecap="round" />
      <path d="M307 237c7 6 15 6 22 0" fill="none" stroke="var(--color-navy)" strokeWidth="3" strokeLinecap="round" />
      <path d="M268 281c15 17 31 25 49 25s35-8 50-25l22 47H246z" fill="var(--color-teal)" />

      <path d="M178 360h282l-30 47H207z" fill="var(--color-navy)" />
      <path d="M195 360h248l-20 31H215z" fill="var(--color-line)" />
      <rect x="282" y="366" width="77" height="5" rx="2.5" fill="var(--color-muted)" opacity="0.5" />
      <path d="M168 408h300" stroke="var(--color-ink)" strokeWidth="8" strokeLinecap="round" />

      <circle cx="505" cy="259" r="24" fill="var(--color-info-bg)" />
      <path d="M495 259h20m-10-10v20" stroke="var(--color-teal)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Field({ id, label, type, value, onChange, error, autoComplete }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
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
          className={`min-h-12 w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal ${
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
