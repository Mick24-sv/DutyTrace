import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import AppFooter from './AppFooter.jsx';
import MobileBottomTabs from './MobileBottomTabs.jsx';
import PullToRefresh from './PullToRefresh.jsx';
import { ROLE_CONFIG, matchesSection } from '../../routes/navConfig.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import useTutorial from '../../hooks/useTutorial.js';
import GuidedQuickStart from '../onboarding/GuidedQuickStart.jsx';

// The authenticated-app frame: sidebar + top bar + page content.
export default function AppShell({ role }) {
  const { user } = useAuth();
  const tutorial = useTutorial(user, role);
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const config = ROLE_CONFIG[role];
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Page title = the nav item whose path matches the current URL.
  const current = config.nav.find(item => matchesSection(config, item, pathname));

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
    <div className="app-shell flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar role={role} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="app-shell-content flex min-w-0 flex-1 flex-col">
        <Topbar role={role} title={current?.label ?? 'DutyTrace'} onMenu={() => setDrawerOpen(true)} onTutorial={() => { setDrawerOpen(false); tutorial.replay(); }} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <PullToRefresh><Outlet /></PullToRefresh>
        </main>
        <AppFooter context={config.label} />
      </div>
      <MobileBottomTabs role={role} />
      <GuidedQuickStart role={role} open={tutorial.open} stepIndex={tutorial.stepIndex} saving={tutorial.saving} onStep={tutorial.selectStep} onSkip={tutorial.skip} onFinish={async destination => {
        const finished = await tutorial.finish();
        if (finished && destination) navigate(destination);
      }} />
    </div>
  );
}
