// Download the signed-in role's first screen while the logo transition runs.
// No API requests or data caching: authorization remains enforced by the server.
export function preloadWorkspace(role) {
  const dashboard = {
    admin: () => import('../pages/admin/AdminDashboard.jsx'),
    supervisor: () => import('../pages/supervisor/SupervisorDashboard.jsx'),
    student: () => import('../pages/student/StudentDashboard.jsx'),
    superadmin: () => import('../pages/superadmin/InstitutionsPage.jsx'),
  }[role];
  if (!dashboard) return Promise.resolve();
  return Promise.allSettled([
    dashboard(),
    ...(role === 'superadmin' ? [] : [import('../components/layout/AppShell.jsx')]),
  ]);
}
