import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import FullPageMessage from './components/layout/FullPageMessage.jsx';
import RequireRole from './routes/RequireRole.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { ROLE_CONFIG } from './routes/navConfig.js';

// Fetch page code on demand instead of downloading every role before sign-in.
const TeammatesPage = lazy(() => import('./pages/student/TeammatesPage.jsx'));
const CatchUpPlanPage = lazy(() => import('./pages/shared/CatchUpPlanPage.jsx'));
const AppearancePage = lazy(() => import('./pages/shared/AppearancePage.jsx'));
const InstitutionsPage = lazy(() => import('./pages/superadmin/InstitutionsPage.jsx'));
const AccountSettingsPage = lazy(() => import('./pages/superadmin/AccountSettingsPage.jsx'));
const ProblemReportsPage = lazy(() => import('./pages/superadmin/ProblemReportsPage.jsx'));
const AcceptInvitationPage = lazy(() => import('./pages/auth/AcceptInvitationPage.jsx'));
const AdminProfilePage = lazy(() => import('./pages/admin/AdminProfilePage.jsx'));
const ProjectSettingsPreview = lazy(() => import('./components/ui/DeleteProjectDialog.jsx').then(module => ({default: module.ProjectSettingsPreview})));
const ConcernsPage = lazy(() => import('./pages/shared/ConcernsPage.jsx'));
const DtrPreviewPage = lazy(() => import('./pages/student/DtrPreviewPage.jsx'));
const DutyScheduleReviewPage = lazy(() => import('./pages/supervisor/DutyScheduleReviewPage.jsx'));
const StudentOverviewPage = lazy(() => import('./pages/admin/StudentOverviewPage.jsx'));
const ProfilePage = lazy(() => import('./pages/student/ProfilePage.jsx'));
const AppShell = lazy(() => import('./components/layout/AppShell.jsx'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard.jsx'));
const SupervisorDashboard = lazy(() => import('./pages/supervisor/SupervisorDashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const OfficesPage = lazy(() => import('./pages/admin/OfficesPage.jsx'));
const QrCodesPage = lazy(() => import('./pages/admin/QrCodesPage.jsx'));
const ScanPage = lazy(() => import('./pages/shared/ScanPage.jsx'));
const MyAttendancePage = lazy(() => import('./pages/shared/MyAttendancePage.jsx'));
const AssistantsPage = lazy(() => import('./pages/supervisor/AssistantsPage.jsx'));
const AssistantDetailPage = lazy(() => import('./pages/supervisor/AssistantDetailPage.jsx'));
const MyDtrPage = lazy(() => import('./pages/student/MyDtrPage.jsx'));
const DtrReviewPage = lazy(() => import('./pages/supervisor/DtrReviewPage.jsx'));
const DtrOverviewPage = lazy(() => import('./pages/admin/DtrOverviewPage.jsx'));
const PolicySettingsPage = lazy(() => import('./pages/admin/PolicySettingsPage.jsx'));
const AcademicTermsPage = lazy(() => import('./pages/admin/AcademicTermsPage.jsx'));
const AuditTrailPage = lazy(() => import('./pages/admin/AuditTrailPage.jsx'));
const SupervisorQrPage = lazy(() => import('./pages/supervisor/SupervisorQrPage.jsx'));
const DtrDetailPage = lazy(() => import('./pages/shared/DtrDetailPage.jsx'));
const MyAbsencesPage = lazy(() => import('./pages/student/MyAbsencesPage.jsx'));
const AbsenceQueuePage = lazy(() => import('./pages/supervisor/AbsenceQueuePage.jsx'));
const AbsenceDetailPage = lazy(() => import('./pages/shared/AbsenceDetailPage.jsx'));
const CasesListPage = lazy(() => import('./pages/shared/CasesListPage.jsx'));
const CaseDetailPage = lazy(() => import('./pages/shared/CaseDetailPage.jsx'));
const ReportsPage = lazy(() => import('./pages/shared/ReportsPage.jsx'));
const AttendanceDiscrepanciesPage = lazy(() => import('./pages/shared/AttendanceDiscrepanciesPage.jsx'));
const HistoricalHoursPage = lazy(() => import('./pages/shared/HistoricalHoursPage.jsx'));

const DASHBOARDS = {
  student: StudentDashboard,
  supervisor: SupervisorDashboard,
  admin: AdminDashboard,
};

// Active pages, including secondary tools reached from their parent section.
const BUILT_PAGES = {
  student: { concerns: ConcernsPage, scan: ScanPage, attendance: MyAttendancePage, discrepancies: AttendanceDiscrepanciesPage, dtr: MyDtrPage, absences: MyAbsencesPage, cases: CasesListPage },
  supervisor: { concerns: ConcernsPage, 'schedule-review': DutyScheduleReviewPage, 'office-qr': SupervisorQrPage, attendance: MyAttendancePage, discrepancies: AttendanceDiscrepanciesPage, assistants: AssistantsPage, scan: ScanPage, 'historical-hours': HistoricalHoursPage, 'dtr-review': DtrReviewPage, absences: AbsenceQueuePage, cases: CasesListPage, reports: ReportsPage },
  admin: { concerns: ConcernsPage, users: UsersPage, 'historical-hours': HistoricalHoursPage, semesters: AcademicTermsPage, offices: OfficesPage, 'qr-codes': QrCodesPage, dtrs: DtrOverviewPage, discrepancies: AttendanceDiscrepanciesPage, cases: CasesListPage, reports: ReportsPage, audit: AuditTrailPage, settings: PolicySettingsPage },
};

// Built pages that are not in the sidebar (reached by links).
const EXTRA_ROUTES = {
  student: [
    { path: 'profile', Page: ProfilePage },
    { path: 'teammates', Page: TeammatesPage },
    { path: 'co-workers', Page: TeammatesPage },
    { path: 'dtr/preview/:month', Page: DtrPreviewPage },
    { path: 'dtr/:id', Page: DtrDetailPage },
    { path: 'absences/:id', Page: AbsenceDetailPage },
    { path: 'cases/:id', Page: CaseDetailPage },
  ],
  supervisor: [
    { path: 'profile', Page: ProfilePage },
    { path: 'assistants/:userId', Page: AssistantDetailPage },
    { path: 'dtr-review/:id', Page: DtrDetailPage },
    { path: 'absences/:id', Page: AbsenceDetailPage },
    { path: 'cases/:id', Page: CaseDetailPage },
  ],
  admin: [
    { path: 'profile', Page: AdminProfilePage },
    { path: 'users/:userId', Page: StudentOverviewPage },
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
    <Suspense fallback={<FullPageMessage>Loading workspace...</FullPageMessage>}>
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/project-settings" element={<ProjectSettingsPreview />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route element={<RequireRole role="superadmin"/>}>
        <Route path="/superadmin" element={<InstitutionsPage/>}/>
        <Route path="/superadmin/account" element={<AccountSettingsPage/>}/>
        <Route path="/superadmin/appearance" element={<AppearancePage/>}/>
        <Route path="/superadmin/problem-reports" element={<ProblemReportsPage/>}/>
        <Route path="/superadmin/*" element={<Navigate to="/superadmin" replace/>}/>
      </Route>

      {Object.entries(ROLE_CONFIG).filter(([role])=>role!=='superadmin').map(([role, config]) => {
        const Dashboard = DASHBOARDS[role];
        return (
          <Route key={role} element={<RequireRole role={role} />}>
            <Route path={config.base} element={<AppShell role={role} />}>
              <Route index element={<Dashboard />} />
              <Route path="catch-up/:termId/:studentId" element={<CatchUpPlanPage />} />
              <Route path="appearance" element={<AppearancePage/>}/>
              {Object.entries(BUILT_PAGES[role]).map(([path, Page]) => <Route key={path} path={path} element={<Page />} />)}
              {['schedule', 'recovery-review', 'duty-alerts', 'policies', 'effective-policies', 'policy-templates', 'semester-transitions', 'duty-requirements'].map(path =>
                <Route key={path} path={path} element={<Navigate to={role === 'admin' ? '/admin/settings' : role === 'supervisor' ? '/supervisor/assistants' : '/student/attendance'} replace />} />)}
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
    </Suspense>
  );
}
