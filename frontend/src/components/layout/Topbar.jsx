import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import { useApiHealth } from '../../hooks/useApiHealth.js';
import { useAuth } from '../../hooks/useAuth.jsx';

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

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white"
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
            className="absolute right-0 mt-2 w-64 rounded-card border border-line bg-surface p-1 shadow-card"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              {user.office && <p className="mt-1 truncate text-xs text-muted">Office: {user.office.name}</p>}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas"
            >
              <LogOut className="h-4 w-4 text-teal" aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
