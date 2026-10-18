import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { ROLE_CONFIG } from '../../routes/navConfig.js';

export default function Sidebar({ role, open, onClose }) {
  const config = ROLE_CONFIG[role];

  const nav = (
    <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-1">
        {config.nav.map(({ to, label, icon: Icon }) => (
          <li key={label}>
            <NavLink
              to={to ? `${config.base}/${to}` : config.base}
              end={!to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );

  const brand = (
    <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
      <img
        src="/logo.png"
        alt="DutyTrace Logo"
        className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-0.5 shadow-sm"
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-base font-semibold text-white">DutyTrace</p>
        <p className="truncate text-[11px] text-white/60">{config.label}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col bg-navy lg:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile/tablet: slide-over drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/50"
            onClick={onClose}
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-navy">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded p-1 text-white/80 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            {brand}
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
