import { useEffect, useState } from 'react';
import { apiGet } from '../services/api.js';
import { useListRefreshRegistry } from '../components/layout/PullToRefresh.jsx';

// Loads GET `path` once (or again when `path` changes). Pass null to skip.
// Returns { data, loading, error } so pages can show loading / error / empty states.
export function useApiData(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null });
  const registerRefresh = useListRefreshRegistry();

  useEffect(() => {
    if (!path || !registerRefresh) return undefined;
    let mounted = true;
    const controllers = new Set();
    const unregister = registerRefresh(async () => {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const data = await apiGet(path, { signal: controller.signal });
        return () => { if (mounted) setState({ data, loading: false, error: null }); };
      } finally { controllers.delete(controller); }
    });
    return () => {
      mounted = false;
      unregister();
      controllers.forEach(controller => controller.abort());
    };
  }, [path, registerRefresh]);

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    apiGet(path, { signal: controller.signal })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ data: null, loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [path]);

  return state;
}
