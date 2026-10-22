import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, CircleCheck, ClipboardList, Eye, EyeOff, LockKeyhole, ScanLine } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import Button from '../../components/ui/Button.jsx';
import FullPageMessage from '../../components/layout/FullPageMessage.jsx';
import AppFooter from '../../components/layout/AppFooter.jsx';

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

      <main className="grid min-h-[calc(100vh-140px)] w-full bg-surface lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex min-h-[calc(100vh-140px)] flex-col px-6 py-8 sm:px-10 lg:px-12 xl:px-20">
          <div className="flex flex-1 items-center justify-center py-6 sm:py-10">
            <div className="w-full max-w-[480px]">
              <div className="mb-10">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-teal">Your DutyTrace workspace</p>
                <h1 className="text-4xl font-medium tracking-tight text-navy sm:text-[2.6rem]">Welcome back</h1>
                <p className="mt-3 text-base text-muted">Sign in to your DutyTrace account.</p>
              </div>

              <form onSubmit={onSubmit} noValidate>
                {error && (
                  <p role="alert" className="mb-5 rounded-lg border border-bad-fg/20 bg-bad-bg px-4 py-3 text-sm text-bad-fg">
                    {error}
                  </p>
                )}

                <Field
                  id="email" label="Email address" placeholder="Enter your email address" type="email" autoComplete="username"
                  value={email} onChange={setEmail} error={fieldErrors.email}
                />
                <Field
                  id="password" label="Password" placeholder="Enter your password" type="password" autoComplete="current-password"
                  value={password} onChange={setPassword} error={fieldErrors.password}
                />

                <div className="-mt-1 mb-6 text-right">
                  <Link
                    to="/forgot-password"
                    className="rounded-sm text-sm font-semibold text-teal transition-colors hover:text-navy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button variant="accent" type="submit" className="mt-1 min-h-14 w-full rounded-lg text-base font-semibold shadow-sm transition-colors" disabled={submitting} aria-busy={submitting}>
                  {submitting ? 'Signing in…' : <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                </Button>
              </form>

              <div className="mt-8 flex items-center gap-3 border-t border-line pt-5 text-sm text-muted">
                <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Secure access to your workspace</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="relative hidden min-h-[calc(100vh-140px)] items-center justify-center overflow-hidden bg-canvas px-8 py-12 lg:flex xl:px-14">
          <div className="relative w-full max-w-[650px]">
            <div className="mb-8 text-center">
              <p className="mb-4 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-teal"><span className="h-0.5 w-5 bg-teal" aria-hidden="true" />Every hour counts</p>
              <h2 className="text-3xl font-semibold tracking-tight text-navy xl:text-[2.5rem]">Your duty. Your progress.</h2>
              <p className="mx-auto mt-3 max-w-md text-base leading-7 text-muted">Track your hours. Stay on schedule.<br />Meet your requirements.</p>
            </div>
            <DutyIllustration />
            <div className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3 text-xs text-muted">
              {['Clearer records', 'Track your Hours', 'More peace of mind'].map((item) => <span key={item} className="inline-flex items-center gap-2"><CircleCheck className="h-4 w-4 text-teal" aria-hidden="true" />{item}</span>)}
            </div>
          </div>
        </aside>

      </main>
      <AppFooter />
    </div>
  );
}

function DutyIllustration() {
  const bars = [42, 65, 53, 82, 71, 100, 77];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="relative mx-auto w-full max-w-[620px] pb-5">
      <div role="img" aria-label="Example DutyTrace overview showing weekly duty hours, recent approved shifts, and semester progress" className="rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_55px_-34px_rgba(21,59,80,0.35)] sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-bg text-teal"><ScanLine className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-sm font-semibold text-navy">My overview</p><p className="text-[11px] text-muted">Illustrative preview</p></div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-4 w-4" aria-hidden="true" />This week</span>
        </div>

        <div className="grid gap-6 sm:grid-cols-[1fr_0.95fr]">
          <div>
            <p className="text-xs text-muted">Hours this week</p>
            <p className="mt-1 flex items-baseline gap-1.5 text-navy"><strong className="text-4xl font-medium tracking-tight">32.5</strong><span className="text-sm text-muted">/ 40 hrs</span></p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full w-[81%] rounded-full bg-teal" /></div>
            <p className="mt-2 text-[11px] font-medium text-teal">81% of your weekly goal</p>
          </div>
          <div className="flex min-h-[116px] items-end justify-between gap-2 px-1" aria-hidden="true">
            {bars.map((height, index) => <div key={`${days[index]}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className={`w-full max-w-7 rounded-t-md ${index === 5 ? 'bg-teal' : 'bg-teal/20'}`} style={{ height: `${height}%` }} /><span className="text-[10px] text-muted">{days[index]}</span></div>)}
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-navy">Recent activity</p><span className="text-[11px] font-medium text-teal">View all →</span></div>
          <div className="flex items-center gap-3 border-t border-line py-3 first:border-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted"><ClipboardList className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-navy">Morning duty</p><p className="mt-0.5 text-[10px] text-muted">Today · 8:00 AM – 12:00 PM</p></div>
            <span className="text-xs font-semibold text-navy">4.0 hrs</span>
            <span className="rounded-full bg-ok-bg px-2.5 py-1 text-[10px] font-medium text-ok-fg">Approved</span>
          </div>
          <div className="flex items-center gap-3 border-t border-line py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted"><ClipboardList className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-navy">Afternoon duty</p><p className="mt-0.5 text-[10px] text-muted">Yesterday · 1:00 PM – 5:30 PM</p></div>
            <span className="text-xs font-semibold text-navy">4.5 hrs</span>
            <span className="rounded-full bg-ok-bg px-2.5 py-1 text-[10px] font-medium text-ok-fg">Approved</span>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-1 right-2 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg sm:-right-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok-bg text-teal"><Check className="h-5 w-5" aria-hidden="true" /></span>
        <div><p className="text-xs font-semibold text-navy">You&apos;re right on track</p><p className="mt-0.5 text-[10px] text-muted">Your latest hours are up to date.</p></div>
      </div>
    </div>
  );
}

function Field({ id, label, type, value, onChange, error, autoComplete, placeholder }) {
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
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-14 w-full rounded-lg border border-line bg-surface px-4 text-base text-ink placeholder:text-muted transition-colors focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 ${
            isPassword ? 'pr-12' : ''
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-1 right-1 flex w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal"
          >
            {showPassword ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-bad-fg">{error}</p>}
    </div>
  );
}
