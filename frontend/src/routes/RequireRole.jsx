import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { ROLE_CONFIG } from './navConfig.js';
import FullPageMessage from '../components/layout/FullPageMessage.jsx';

// Route guard. Not signed in -> /login. Signed in with the wrong role -> that
// user's own dashboard. (The API independently rejects forbidden requests.)
export default function RequireRole({ role }) {
  const { user, status, loadError } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageMessage>Loading…</FullPageMessage>;
  if (!user) {
    if (loadError) return <FullPageMessage tone="error">{loadError}. Is the API running?</FullPageMessage>;
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.role !== role) return <Navigate to={ROLE_CONFIG[user.role].base} replace />;
  return <Outlet />;
}
