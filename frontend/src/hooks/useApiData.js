import { useEffect, useState } from 'react';
import { apiGet } from '../services/api.js';

// Loads GET `path` once (or again when `path` changes). Pass null to skip.
// Returns { data, loading, error } so pages can show loading / error / empty states.
export function useApiData(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null });

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
