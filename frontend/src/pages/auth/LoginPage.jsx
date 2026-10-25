import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import Button from '../../components/ui/Button.jsx';
import FullPageMessage from '../../components/layout/FullPageMessage.jsx';
import './login.css';

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const accountHelpRef = useRef(null);
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
    <div className="login-page">
      <header className="login-site-header"><img src="/logo.png" alt="DutyTrace logo" /><span>DutyTrace</span></header>
      <main className="login-card">
        <aside className="login-story">
          <p className="login-eyebrow"><Clock3 size={17} aria-hidden="true" /> EVERY HOUR COUNTS</p>
          <div className="login-story-copy">
            <h2>Your time.<br />Your effort.<br /><em>All accounted for.</em></h2>
            <p>Show up with purpose. Track your progress.<br className="hidden sm:block" /> Make every duty hour count.</p>
          </div>
          <div className="login-art" aria-hidden="true">
            <div className="login-orbit login-orbit-one" /><div className="login-orbit login-orbit-two" />
            <div className="login-clock">
              {Array.from({ length: 12 }, (_, i) => <span className="login-clock-tick" key={i} style={{ transform: 'rotate(' + i * 30 + 'deg)' }} />)}
              <span className="login-clock-hand login-clock-hour" /><span className="login-clock-hand login-clock-minute" /><span className="login-clock-center" />
            </div>
            <div className="login-verified"><Check size={23} strokeWidth={3} /><span>Time well spent.<small>Progress you can count on.</small></span></div>
            <span className="login-art-dot login-art-dot-one" /><span className="login-art-dot login-art-dot-two" />
          </div>
          <p className="login-story-foot"><span /> A little more clarity. Every single day.</p>
        </aside>
        <section className="login-form-panel" aria-labelledby="login-heading">
          <div className="login-form-inner">
            <div className="login-brand"><img src="/logo.png" alt="DutyTrace logo" /><div><span>DutyTrace</span><p>DUTY HOURS, VERIFIED.</p></div></div>
            <div className="login-heading"><p className="login-form-eyebrow">YOUR WORKSPACE AWAITS</p><h1 id="login-heading">Welcome back.</h1><p>Sign in and pick up where you left off.</p></div>
            <form onSubmit={onSubmit} noValidate>
              {error && <p role="alert" className="mb-5 rounded-lg border border-bad-fg/20 bg-bad-bg px-4 py-3 text-sm text-bad-fg">{error}</p>}
              <Field id="email" label="Email address" placeholder="you@example.com" type="email" autoComplete="username" value={email} onChange={setEmail} error={fieldErrors.email} />
              <Field id="password" label="Password" placeholder="Enter your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={fieldErrors.password} />
              <div className="login-forgot"><Link to="/forgot-password">Forgot password?</Link></div>
              <Button type="submit" className="login-submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Signing in\u2026' : <>Sign in <ArrowRight size={18} aria-hidden="true" /></>}</Button>
            </form>
            <div className="login-security"><LockKeyhole size={15} aria-hidden="true" /><span>Secure access. A clearer day ahead.</span></div>
            <p className="login-help">Need an account? <button type="button" onClick={() => accountHelpRef.current.showModal()} aria-haspopup="dialog">Contact the Admission Office.</button></p>
            <dialog ref={accountHelpRef} className="login-account-dialog" aria-labelledby="account-help-title" aria-describedby="account-help-description" onClick={(event) => { if (event.target === event.currentTarget) accountHelpRef.current.close(); }}>
              <div className="login-account-content">
                <h2 id="account-help-title">Need a DutyTrace account?</h2>
                <p id="account-help-description">Accounts are provided by your institution. Contact the Admission Office to request access to DutyTrace.</p>
                <form method="dialog"><Button type="submit" autoFocus>Got it</Button></form>
              </div>
            </dialog>
            <footer className="login-footer">&copy; {new Date().getFullYear()} DutyTrace<span>Duty hours, verified.</span></footer>
          </div>
        </section>
      </main>
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
