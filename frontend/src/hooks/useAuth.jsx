import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet, apiPost } from '../services/api.js';

// Real authentication state. The server is the source of truth: on load we ask
// GET /auth/me whether the session cookie is valid. Frontend route guards only
// improve the experience; the API enforces permissions itself.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready'
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    apiGet('/auth/me', { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // 401 just means "not signed in". Anything else (server down) is worth showing.
        if (!(err instanceof ApiError && err.status === 401)) setLoadError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatus('ready');
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiPost('/auth/login', { email, password });
    setUser(data.user);
    setLoadError(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setUser(null); // always clear local state, even if the request failed
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, loadError, login, logout }),
    [user, status, loadError, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
