import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ROLE_CONFIG, matchesSection } from '../../routes/navConfig.js';
import './mobile-bottom-tabs.css';

const SHORT_LABELS = {
  'Monthly DTR': 'DTR', 'Absence Notices': 'Absences',
  'Student Assistants': 'Assistants', 'Students & Staff': 'People',
  'Academic Terms': 'Terms',
};

export default function MobileBottomTabs({ role }) {
  const { pathname } = useLocation();
  const config = ROLE_CONFIG[role];
  const active = config.nav.findIndex(item => matchesSection(config, item, pathname));
  const trackRef = useRef(null);
  const indicatorRef = useRef(null);
  const animationRef = useRef(null);
  const previousRef = useRef(null);
  const [retapPhase, setRetapPhase] = useState('idle');
  const [scrollHidden, setScrollHidden] = useState(false);
  const retapRef = useRef(null);

  useEffect(() => {
    setScrollHidden(false);
    let previous = Math.max(0, window.scrollY);
    let distance = 0;
    const onScroll = () => {
      // Clamp Safari's rubber-band overscroll so it cannot reverse direction.
      const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const current = Math.min(maximum, Math.max(0, window.scrollY));
      const delta = current - previous;
      previous = current;
      if (current < 48) {
        distance = 0;
        setScrollHidden(false);
        return;
      }
      if (!delta) return;
      distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
      if (Math.abs(distance) >= 12) {
        setScrollHidden(distance < 0);
        distance = 0;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname, role]);

  // Cancel pending feedback when navigating away or unmounting.
  useEffect(() => {
    setRetapPhase('idle');
    return () => {
      retapRef.current?.();
      retapRef.current = null;
    };
  }, [pathname, role]);

  function handleTabClick(event, index) {
    if (index !== active || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    retapRef.current?.();
    setRetapPhase('scrolling');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame;
    let timer;
    let cancelled = false;
    const started = performance.now();
    retapRef.current = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };

    window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
    function checkTop() {
      if (cancelled) return;
      if (window.scrollY <= 1) {
        setRetapPhase('updating');
        timer = setTimeout(() => {
          setRetapPhase('idle');
          retapRef.current = null;
        }, 1400);
      } else if (performance.now() - started < 4000) {
        frame = requestAnimationFrame(checkTop);
      } else {
        // A user may interrupt the scroll; don't show completion feedback.
        setRetapPhase('idle');
        retapRef.current = null;
      }
    }
    frame = requestAnimationFrame(checkTop);
  }

  useLayoutEffect(() => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    const tab = track.querySelector(`[data-tab-index="${active}"]`);
    if (!tab) {
      indicator.hidden = true;
      animationRef.current?.cancel();
      previousRef.current = null;
      return;
    }

    function position(animate) {
      const target = { left: tab.offsetLeft + 5, width: tab.offsetWidth - 10 };
      // Read the current visual position before cancelling, so rapid taps flow
      // directly into the next stretch rather than jumping to the last target.
      const current = indicator.getBoundingClientRect();
      const trackBounds = track.getBoundingClientRect();
      const start = { left: current.left - trackBounds.left, width: current.width };
      animationRef.current?.cancel();
      indicator.hidden = false;
      indicator.style.left = `${target.left}px`;
      indicator.style.width = `${target.width}px`;

      if (animate && previousRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const movingRight = target.left > start.left;
        const stretch = movingRight
          ? { left: start.left, width: target.left + target.width - start.left }
          : { left: target.left, width: start.left + start.width - target.left };
        animationRef.current = indicator.animate([
          { left: `${start.left}px`, width: `${start.width}px`, transform: 'scaleY(1)', offset: 0 },
          { left: `${stretch.left}px`, width: `${stretch.width}px`, transform: 'scaleY(.72)', offset: .42 },
          { left: `${target.left}px`, width: `${target.width}px`, transform: 'scaleY(1.07)', offset: .82 },
          { left: `${target.left}px`, width: `${target.width}px`, transform: 'scaleY(1)', offset: 1 },
        ], { duration: 560, easing: 'cubic-bezier(.22,.68,.2,1)' });
      }
      previousRef.current = target;
    }

    position(true);
    // Keep the active item in view when a role has more tabs than fit on screen.
    const viewport = track.parentElement;
    const left = Math.max(0, tab.offsetLeft - (viewport.clientWidth - tab.offsetWidth) / 2);
    viewport.scrollTo({ left, behavior: 'instant' });
    let trackWidth = track.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = track.getBoundingClientRect().width;
      if (nextWidth !== trackWidth) {
        trackWidth = nextWidth;
        position(false);
      }
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [active, role]);

  useLayoutEffect(() => () => animationRef.current?.cancel(), []);

  return (
    <nav className="mobile-bottom-tabs no-print" data-scroll-hidden={scrollHidden && retapPhase === 'idle'} onFocusCapture={() => setScrollHidden(false)} aria-label="Mobile navigation">
      <div className="mobile-bottom-tabs-feedback" role="status" aria-live="polite" aria-atomic="true">
        {retapPhase === 'updating' && <span className="mobile-bottom-tabs-updating"><LoaderCircle size={14} aria-hidden="true" />Updating</span>}
      </div>
      <div className="mobile-bottom-tabs-scroll">
        <div className="mobile-bottom-tabs-track" ref={trackRef}>
          <span ref={indicatorRef} className="mobile-bottom-tabs-liquid" aria-hidden="true" hidden />
          {config.nav.map(({ to, label, icon: Icon }, index) => (
            <Link key={to} to={to ? `${config.base}/${to}` : config.base}
              data-tab-index={index} aria-current={index === active ? 'page' : undefined}
              aria-label={index === active ? `${label}, scroll to top` : label} className="mobile-bottom-tab"
              onClick={event => handleTabClick(event, index)}>
              {index === active && retapPhase !== 'idle'
                ? <ArrowUp className="mobile-bottom-tab-up-arrow" size={20} strokeWidth={2.2} aria-hidden="true" />
                : <Icon size={20} strokeWidth={index === active ? 2.2 : 1.7} aria-hidden="true" />}
              <span>{SHORT_LABELS[label] ?? label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
