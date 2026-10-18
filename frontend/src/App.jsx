import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import FullPageMessage from './components/layout/FullPageMessage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import ComingSoon from './pages/ComingSoon.jsx';
import NotFound from './pages/NotFound.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import UsersPage from './pages/admin/UsersPage.jsx';
import OfficesPage from './pages/admin/OfficesPage.jsx';
import QrCodesPage from './pages/admin/QrCodesPage.jsx';
import ScanPage from './pages/shared/ScanPage.jsx';
import MyAttendancePage from './pages/shared/MyAttendancePage.jsx';
import AssistantsPage from './pages/supervisor/AssistantsPage.jsx';
import AssistantDetailPage from './pages/supervisor/AssistantDetailPage.jsx';
import MyDtrPage from './pages/student/MyDtrPage.jsx';
import DtrReviewPage from './pages/supervisor/DtrReviewPage.jsx';
import DtrOverviewPage from './pages/admin/DtrOverviewPage.jsx';
import PolicySettingsPage from './pages/admin/PolicySettingsPage.jsx';
import AcademicTermsPage from './pages/admin/AcademicTermsPage.jsx';
import DtrDetailPage from './pages/shared/DtrDetailPage.jsx';
import MyAbsencesPage from './pages/student/MyAbsencesPage.jsx';
import AbsenceQueuePage from './pages/supervisor/AbsenceQueuePage.jsx';
import AbsenceDetailPage from './pages/shared/AbsenceDetailPage.jsx';
import CasesListPage from './pages/shared/CasesListPage.jsx';
import CaseDetailPage from './pages/shared/CaseDetailPage.jsx';
import ReportsPage from './pages/shared/ReportsPage.jsx';
import RequireRole from './routes/RequireRole.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { ROLE_CONFIG } from './routes/navConfig.js';

const DASHBOARDS = {
  student: StudentDashboard,
  supervisor: SupervisorDashboard,
  admin: AdminDashboard,
};

// Pages that are really built; every other nav item falls back to <ComingSoon>.
const BUILT_PAGES = {
  student: { scan: ScanPage, attendance: MyAttendancePage, dtr: MyDtrPage, absences: MyAbsencesPage, cases: CasesListPage },
  supervisor: { scan: ScanPage, attendance: MyAttendancePage, assistants: AssistantsPage, 'dtr-review': DtrReviewPage, absences: AbsenceQueuePage, cases: CasesListPage, reports: ReportsPage },
  admin: { users: UsersPage, semesters: AcademicTermsPage, offices: OfficesPage, 'qr-codes': QrCodesPage, dtrs: DtrOverviewPage, cases: CasesListPage, settings: PolicySettingsPage, reports: ReportsPage },
};

// Built pages that are not in the sidebar (reached by links).
const EXTRA_ROUTES = {
  student: [
    { path: 'dtr/:id', Page: DtrDetailPage },
    { path: 'absences/:id', Page: AbsenceDetailPage },
    { path: 'cases/:id', Page: CaseDetailPage },
  ],
  supervisor: [
    { path: 'assistants/:userId', Page: AssistantDetailPage },
    { path: 'dtr-review/:id', Page: DtrDetailPage },
    { path: 'absences/:id', Page: AbsenceDetailPage },
    { path: 'cases/:id', Page: CaseDetailPage },
  ],
  admin: [
    { path: 'dtrs/:id', Page: DtrDetailPage },
    { path: 'cases/:id', Page: CaseDetailPage },
    { path: 'absences/:id', Page: AbsenceDetailPage },
  ],
};

function HomeRedirect() {
  const { user, status } = useAuth();
  if (status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  return <Navigate to={user ? ROLE_CONFIG[user.role].base : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {Object.entries(ROLE_CONFIG).map(([role, config]) => {
        const Dashboard = DASHBOARDS[role];
        return (
          <Route key={role} element={<RequireRole role={role} />}>
            <Route path={config.base} element={<AppShell role={role} />}>
              <Route index element={<Dashboard />} />
              {config.nav
                .filter((item) => item.to)
                .map((item) => {
                  const Built = BUILT_PAGES[role]?.[item.to];
                  return (
                    <Route
                      key={item.to}
                      path={item.to}
                      element={
                        Built ? <Built /> : <ComingSoon label={item.label} phase={item.phase} icon={item.icon} />
                      }
                    />
                  );
                })}
              {(EXTRA_ROUTES[role] ?? []).map(({ path, Page }) => (
                <Route key={path} path={path} element={<Page />} />
              ))}
              <Route path="*" element={<NotFound base={config.base} />} />
            </Route>
          </Route>
        );
      })}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
