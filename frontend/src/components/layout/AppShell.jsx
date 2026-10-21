import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import AppFooter from './AppFooter.jsx';
import { ROLE_CONFIG } from '../../routes/navConfig.js';

// The authenticated-app frame: sidebar + top bar + page content.
export default function AppShell({ role }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const config = ROLE_CONFIG[role];

  // Page title = the nav item whose path matches the current URL.
  const current = config.nav.find((item) =>
    item.to ? pathname.startsWith(`${config.base}/${item.to}`) : pathname === config.base,
  );

  useEffect(() => {
    document.title = `${current?.label ?? 'Page'} · DutyTrace`;
  }, [current]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar role={role} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <Topbar role={role} title={current?.label ?? 'DutyTrace'} onMenu={() => setDrawerOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
        <AppFooter context={config.label} />
      </div>
    </div>
  );
}
