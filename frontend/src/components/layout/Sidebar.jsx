import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ROLE_CONFIG, matchesSection } from '../../routes/navConfig.js';
import SidebarCalendar from './SidebarCalendar.jsx';
import './sidebar-rail.css';

export default function Sidebar({ role, open, onClose }) {
  const config = ROLE_CONFIG[role];
  const { pathname } = useLocation();
  const [railHovered, setRailHovered] = useState(false);
  const [railDismissed, setRailDismissed] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const scrollY = window.scrollY;
    const body = document.body;
    const saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      Object.assign(body.style, saved);
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [open]);
  const sections = config.nav.reduce((result, item) => {
    const title = item.section ?? '';
    const current = result[result.length - 1];
    if (!current || current.title !== title) result.push({ title, items: [item] });
    else current.items.push(item);
    return result;
  }, []);

  const nav = (
    <nav aria-label="Main navigation" className="sidebar-navigation min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ul className="space-y-4">
        {sections.map(({ title, items }) => (
          <li key={title || 'main-navigation'}>
            {title && <h2 className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-white/50">{title}</h2>}
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon, related }) => (
                <li key={label}>
                  <NavLink
                    to={to ? `${config.base}/${to}` : config.base}
                    end={!to}
                    aria-label={label}
                    title={label}
                    aria-current={matchesSection(config, {to, related}, pathname) ? 'page' : undefined}
                    onClick={event => {
                      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                        setRailDismissed(true);
                        onClose();
                      }
                    }}
                    className={() =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        matchesSection(config, {to, related}, pathname)
                          ? 'bg-teal text-white'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="sidebar-link-label">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <SidebarCalendar role={role} onNavigate={onClose} />
    </nav>
  );

  const brand = (
    <div className="sidebar-brand flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
      <img
        src="/logo.png"
        alt="DutyTrace Logo"
        className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain shadow-sm"
      />
      <div className="sidebar-brand-label min-w-0 leading-tight">
        <p className="truncate text-base font-semibold text-white">DutyTrace</p>
        <p className="truncate text-[11px] text-white/60">{config.label}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="desktop-sidebar-rail no-print fixed inset-y-0 left-0 hidden flex-col bg-navy lg:flex" aria-label="Sidebar"
        data-hover-open={railHovered && !railDismissed ? 'true' : undefined}
        onPointerEnter={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setRailHovered(true); }}
        onPointerLeave={() => { setRailHovered(false); setRailDismissed(false); }}>
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
          <aside className="relative flex h-dvh w-72 max-w-[85%] flex-col overflow-hidden bg-navy">
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
