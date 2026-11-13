import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, apiGet, apiPost } from '../services/api.js';

// Real authentication state. The server is the source of truth: on load we ask
// GET /auth/me whether the session cookie is valid. Frontend route guards only
// improve the experience; the API enforces permissions itself.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { pathname } = useLocation();
  const publicRecoveryPage = ['/forgot-password', '/reset-password', '/accept-invitation'].includes(pathname);
  const revision = useRef(0);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready'
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // Password recovery pages are public and do not need session state. Avoid
    // issuing an expected 401 from /auth/me while a user follows a reset link.
    if (publicRecoveryPage) {
      setUser(null);
      setLoadError(null);
      setStatus('ready');
      return undefined;
    }

    const controller = new AbortController();
    const requestRevision = revision.current;
    apiGet('/auth/me', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted || revision.current !== requestRevision) return;
        setUser(data.user);
        setLoadError(null);
      })
      .catch((err) => {
        if (err.name === 'AbortError' || controller.signal.aborted || revision.current !== requestRevision) return;
        setUser(null);
        // 401 just means "not signed in". Anything else (server down) is worth showing.
        if (!(err instanceof ApiError && err.status === 401)) setLoadError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatus('ready');
      });
    return () => controller.abort();
    // Navigation within the workspace reuses this session. Protected APIs still
    // authorize every request; profile changes explicitly call refreshUser().
  }, [publicRecoveryPage]);

  const login = useCallback(async (email, password) => {
    const data = await apiPost('/auth/login', { email, password });
    revision.current += 1;
    setUser(data.user);
    setLoadError(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    revision.current += 1;
    try {
      await apiPost('/auth/logout');
    } finally {
      setUser(null); // always clear local state, even if the request failed
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const requestRevision = ++revision.current;
    const data = await apiGet('/auth/me');
    if (revision.current === requestRevision) setUser(data.user);
    return data.user;
  }, []);
  const value = useMemo(
    () => ({ user, status, loadError, login, logout, refreshUser }),
    [user, status, loadError, login, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
