import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PULL_REFRESH_THRESHOLD as THRESHOLD, pullRefreshDistance as resistance } from '../../utils/pullToRefresh.js';
import './pull-to-refresh.css';

const RefreshContext = createContext(null);
export const useListRefreshRegistry = () => useContext(RefreshContext);

export default function PullToRefresh({ children }) {
  const { pathname } = useLocation();
  const root = useRef(null);
  const callbacks = useRef(new Set());
  const generation = useRef(0);
  const busy = useRef(false);
  const [view, setView] = useState({ distance: 0, phase: 'idle', message: '' });
  const register = useCallback(callback => {
    callbacks.current.add(callback);
    return () => callbacks.current.delete(callback);
  }, []);

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setView({ distance: 0, phase: 'idle', message: '' });
    return () => { generation.current += 1; };
  }, [pathname]);

  useEffect(() => {
    const element = root.current;
    let gesture = null;
    let timer;

    function start(event) {
      if (busy.current || !callbacks.current.size || event.touches.length !== 1 || window.scrollY > 0 ||
        !window.matchMedia('(max-width: 1023px)').matches ||
        event.target.closest('input, textarea, select, button, a, [contenteditable="true"], dialog')) return;
      // Let nested scrolling lists keep their own gestures.
      for (let node = event.target; node && node !== element; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return;
      }
      clearTimeout(timer);
      gesture = { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0 };
    }
    function move(event) {
      if (!gesture) return;
      const dy = event.touches[0].clientY - gesture.y;
      const dx = event.touches[0].clientX - gesture.x;
      if (event.touches.length !== 1 || dy < 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
        gesture = null;
        setView({ distance: 0, phase: 'idle', message: '' });
        return;
      }
      if (dy < 6 || !event.cancelable) return;
      event.preventDefault();
      gesture.distance = resistance(dy);
      setView({ distance: gesture.distance, phase: 'pulling', message: gesture.distance >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh' });
    }
    async function end(event) {
      if (!gesture) return;
      const distance = gesture.distance;
      gesture = null;
      if (event.type === 'touchcancel' || distance < THRESHOLD) {
        setView({ distance: 0, phase: 'idle', message: '' });
        return;
      }
      const version = generation.current;
      busy.current = true;
      setView({ distance: 52, phase: 'refreshing', message: 'Updating list' });
      // Fetch first, then commit together so existing rows stay in place.
      const results = await Promise.allSettled([...callbacks.current].map(callback => callback()));
      if (version !== generation.current) return;
      results.forEach(result => { if (result.status === 'fulfilled') result.value?.(); });
      const failed = results.some(result => result.status === 'rejected');
      setView({ distance: 0, phase: failed ? 'error' : 'landed', message: failed ? 'Could not refresh. Pull to try again.' : 'List updated' });
      busy.current = false;
      timer = setTimeout(() => setView({ distance: 0, phase: 'idle', message: '' }), failed ? 3500 : 1600);
    }
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
    };
  }, [pathname]);

  const progress = Math.min(1, view.distance / THRESHOLD);
  return (
    <RefreshContext.Provider value={register}>
      <div ref={root} className={`pull-refresh pull-refresh-${view.phase}`} style={{ '--pull-distance': `${view.distance}px` }}>
        <div className="pull-refresh-indicator" aria-hidden="true">
          <div className="pull-refresh-bars">{[0, 1, 2, 3, 4].map(index => <span key={index}><i style={{ transform: `scaleY(${view.phase === 'refreshing' ? 1 : Math.max(0, Math.min(1, progress * 5 - index))})` }} /></span>)}</div>
          <span>{view.message}</span>
        </div>
        <div className="pull-refresh-content">{children}</div>
        <div role="status" aria-live="polite" className="sr-only">{view.phase !== 'pulling' && view.message}</div>
        {(view.phase === 'landed' || view.phase === 'error') && <div className="pull-refresh-result" aria-hidden="true">{view.message}</div>}
      </div>
    </RefreshContext.Provider>
  );
}
