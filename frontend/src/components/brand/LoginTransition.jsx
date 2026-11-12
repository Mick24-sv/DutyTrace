import { useEffect, useRef } from 'react';
import DutyTraceMark from './DutyTraceMark.jsx';
import './login-transition.css';

// Loaded only after sign-in; a plugin/chunk failure must never block navigation.
export const loadLoginAnimation = () => import('./loginLogoAnimation.js');

export default function LoginTransition({ onComplete }) {
  const root = useRef(null);
  const callback = useRef(onComplete);
  callback.current = onComplete;

  useEffect(() => {
    let disposed = false;
    let completed = false;
    let revert;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => {
      if (disposed || completed) return;
      completed = true;
      callback.current();
    };
    // Covers slow or unavailable chunks and suspended/failed animation frames.
    const fallback = window.setTimeout(finish, 7500);
    const reducedTimer = motion.matches ? window.setTimeout(finish, 150) : null;
    if (motion.matches) {
      root.current.classList.add('is-reduced-motion');
      root.current.querySelector('[data-logo-flood]').setAttribute('y', '0');
    }
    else loadLoginAnimation().then(({ animateLoginLogo }) => {
      if (!disposed && !completed) revert = animateLoginLogo(root.current, finish);
    }).catch(finish);
    const changed = event => { if (event.matches) finish(); };
    motion.addEventListener('change', changed);
    return () => {
      disposed = true;
      window.clearTimeout(fallback);
      window.clearTimeout(reducedTimer);
      motion.removeEventListener('change', changed);
      revert?.();
    };
  }, []);

  return <div ref={root} className="login-transition" role="status" aria-live="polite" aria-busy="true">
    <DutyTraceMark />
    <span className="sr-only">Signed in. Opening your workspace.</span>
  </div>;
}
