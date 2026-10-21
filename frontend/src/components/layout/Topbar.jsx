import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, LogOut, Mail, Menu } from 'lucide-react';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import { useApiHealth } from '../../hooks/useApiHealth.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import NotificationCenter from './NotificationCenter.jsx';

const HEALTH_LABEL = {
  checking: { text: 'Checking API…', dot: 'bg-muted' },
  online: { text: 'API online', dot: 'bg-ok-fg' },
  offline: { text: 'API offline', dot: 'bg-bad-fg' },
};

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Topbar({ role, title, onMenu }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const health = HEALTH_LABEL[useApiHealth()];
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => !wrapRef.current?.contains(e.target) && setMenuOpen(false);
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const signOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-lg p-2 text-navy hover:bg-canvas lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <p className="flex-1 truncate text-base font-semibold text-navy">{title}</p>

      <span className="hidden items-center gap-2 text-xs text-muted sm:flex" role="status">
        <span className={`h-2 w-2 rounded-full ${health.dot}`} aria-hidden="true" />
        {health.text}
      </span>

      <NotificationCenter role={role} />

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas sm:rounded-xl sm:bg-canvas sm:px-3"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white sm:h-10 sm:w-10"
            aria-hidden="true"
          >
            {initials(user.fullName)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{user.fullName}</span>
            <span className="block text-xs text-muted">{ROLE_CONFIG[role].label}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl sm:w-96"
          >
            <div className="flex items-center gap-4 border-b border-line px-5 py-5 sm:px-6 sm:py-6">
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-navy text-lg font-semibold text-white" aria-hidden="true">{initials(user.fullName)}</span>
              <div className="min-w-0">
                <p className="break-words text-lg font-semibold leading-tight text-navy">{user.fullName}</p>
                <p className="mt-1 text-sm text-muted">{ROLE_CONFIG[role].label}</p>
              </div>
            </div>
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Email</p>
                  <p className="mt-1 break-all text-sm text-navy">{user.email}</p>
                </div>
              </div>
              {user.office && <div className="flex min-w-0 items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Office</p>
                  <p className="mt-1 break-words text-sm text-navy">{user.office.name}</p>
                </div>
              </div>}
              <div className="border-t border-line pt-4">
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 rounded-xl bg-bad-bg px-4 py-3 text-left text-sm font-medium text-bad-fg transition hover:bg-bad-bg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad-fg"
                >
                  <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
