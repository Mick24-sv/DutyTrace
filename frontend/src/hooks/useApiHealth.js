import { useEffect, useState } from 'react';
import { getHealth } from '../services/api.js';

// Returns 'checking' | 'online' | 'offline' for the backend health endpoint.
export function useApiHealth() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();
    getHealth({ signal: controller.signal })
      .then(() => setState('online'))
      .catch((err) => {
        if (err.name !== 'AbortError') setState('offline');
      });
    return () => controller.abort();
  }, []);

  return state;
}
