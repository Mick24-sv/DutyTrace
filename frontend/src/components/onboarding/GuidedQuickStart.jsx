import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleHelp, Lightbulb, MousePointer2, X } from 'lucide-react';
import { TUTORIALS } from './tutorialContent.js';
import { TUTORIAL_TARGETS, placeTourCard } from './tutorialTargets.js';
import './guided-quick-start.css';

function visible(selector) {
  return [...document.querySelectorAll(selector)].find(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  });
}

export default function GuidedQuickStart({ role, open, stepIndex, saving, onStep, onSkip, onFinish }) {
  const navigate = useNavigate();
  const location = useLocation();
  const tutorial = TUTORIALS[role];
  const step = tutorial.steps[stepIndex];
  const anchor = TUTORIAL_TARGETS[role][stepIndex];
  const card = useRef(null);
  const heading = useRef(null);
  const returnTo = useRef(`/${role}`);
  const wasOpen = useRef(false);
  const closing = useRef(false);
  if (open && !wasOpen.current) {
    returnTo.current = location.pathname + location.search + location.hash;
    closing.current = false;
  }
  wasOpen.current = open;
  const [layout, setLayout] = useState(null);
  const [target, setTarget] = useState(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [resolvedKey, setResolvedKey] = useState(null);
  const activeKey = `${role}:${stepIndex}:${location.pathname}:${location.search}`;
  const isReady = ready && resolvedKey === activeKey && location.pathname === anchor.path && !location.search;
  const id = useId().replace(/:/g, '');
  const last = stepIndex === tutorial.steps.length - 1;

  useEffect(() => {
    if (!open) return undefined;
    const shell = document.querySelector('.app-shell');
    const wasInert = shell?.inert;
    const previousOverflow = document.body.style.overflow;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    return () => {
      if (shell) shell.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => document.querySelector('[data-tutorial="quick-start"]')?.focus({ preventScroll: true }));
    };
    // Capture the starting location only when opening; tour navigation must not overwrite it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || closing.current) return undefined;
    setReady(false); setLayout(null); setTarget(null); setFallback(false);
    heading.current?.focus({ preventScroll: true });
    if (location.pathname !== anchor.path || location.search) {
      navigate(anchor.path, { replace: true });
      return undefined;
    }
    let disposed = false;
    let timer;
    let frame;
    let element;
    let observer;
    const started = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function measure() {
      if (disposed || !element || !card.current) return;
      const rect = element.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const padding = 6;
      const left = Math.max(6, rect.left - padding);
      const top = Math.max(6, rect.top - padding);
      const bounds = { left, top, width: Math.max(1, Math.min(viewport.width - 6, rect.right + padding) - left), height: Math.max(1, Math.min(viewport.height - 6, rect.bottom + padding) - top) };
      const tooltip = card.current.getBoundingClientRect();
      setTarget(bounds);
      setLayout(placeTourCard(bounds, { width: tooltip.width, height: Math.min(card.current.scrollHeight, viewport.height - 24) }, viewport));
    }
    const scheduleMeasure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    function locate() {
      if (disposed) return;
      const primary = visible(anchor.selector);
      const timedOut = performance.now() - started > 2500;
      const secondary = timedOut && (visible(anchor.fallbackSelector || '[data-tutorial="page-header"]') || visible('#main'));
      element = primary || secondary;
      if (!element) { timer = setTimeout(locate, 100); return; }
      setFallback(!primary);
      setReady(true);
      setResolvedKey(activeKey);
      // Place the real control near the upper part of the screen on mobile,
      // leaving room for the instructions without covering it.
      const rect = element.getBoundingClientRect();
      const desiredTop = 88;
      if (getComputedStyle(element).position !== 'fixed' && (rect.top < 72 || rect.bottom > window.innerHeight * .42)) {
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - desiredTop), behavior: reducedMotion ? 'instant' : 'smooth' });
      }
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(element);
      observer.observe(card.current);
      measure();
      frame = requestAnimationFrame(measure);
      // Re-evaluate when the final loading/fallback message changes the card size.
      timer = setTimeout(scheduleMeasure, 80);
    }
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    // Wait until the shell has finished its own scroll-to-top for this route.
    timer = setTimeout(locate, 60);
    return () => {
      disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [open, role, stepIndex, anchor, location.pathname, location.search, navigate]);

  function close() { closing.current = true; onSkip(); navigate(returnTo.current, { replace: true }); }
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); if (!saving) close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...card.current.querySelectorAll('button:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
    const first = focusable[0]; const end = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); end?.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); }
  }
  if (!open) return null;
  const width = Math.min(382, window.innerWidth - 24);
  return createPortal(<div className="guided-tour-layer" onKeyDown={keyboard}>
    <svg className="guided-tour-shade" aria-hidden="true"><defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="white" />{isReady && target && <rect x={target.left} y={target.top} width={target.width} height={target.height} rx="10" fill="black" />}</mask></defs><rect width="100%" height="100%" fill="rgb(21 59 80 / .62)" mask={`url(#${id}-mask)`} /></svg>
    {isReady && target && <div className="guided-tour-highlight" style={{ left: target.left, top: target.top, width: target.width, height: target.height }} aria-hidden="true"><span /></div>}
    <section ref={card} className={`guided-tour-card${isReady ? ' is-ready' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-description`} style={{ width, left: layout?.left ?? Math.max(12, (window.innerWidth - width) / 2), top: layout?.top ?? 24, maxHeight: layout?.maxHeight ?? window.innerHeight - 48 }}>
      <header><span><CircleHelp size={15} aria-hidden="true" />{tutorial.roleLabel}<small>Step {stepIndex + 1} / {tutorial.steps.length}</small></span><button type="button" onClick={close} disabled={saving} aria-label="Close guided tour"><X size={17} /></button></header>
      <div className="guided-tour-body"><nav className="guided-tour-steps" aria-label="Guided tour steps">{tutorial.steps.map((item, index) => <button key={item.label} type="button" aria-label={`Go to step ${index + 1}: ${item.label}`} aria-current={index === stepIndex ? 'step' : undefined} disabled={saving} onClick={() => onStep(index)}><span className={index <= stepIndex ? 'is-filled' : ''} /></button>)}</nav>
        <span className="guided-tour-step-label">{step.label}</span><h2 ref={heading} tabIndex={-1} id={`${id}-heading`}>{step.title}</h2><p id={`${id}-description`} className="guided-tour-description">{step.description}</p>
        <div className="guided-tour-target" role="status"><MousePointer2 size={15} aria-hidden="true" /><div><strong>{isReady ? fallback ? 'This page is highlighted' : anchor.caption : 'Opening the right place…'}</strong><p>{isReady ? fallback ? anchor.unavailable || 'This control is not available yet. You can continue the tour and return to this section later.' : anchor.detail : 'We’re finding this step on your screen.'}</p></div></div>
        <ol className="guided-tour-instructions">{step.bullets.map((bullet, index) => <li key={bullet}><span aria-hidden="true">{index + 1}</span><p>{bullet}</p></li>)}</ol>
        <p className="guided-tour-tip"><Lightbulb size={14} aria-hidden="true" />{step.tip}</p>
        {last && <div className="guided-tour-destinations">{step.actions.map(action => <button key={action.path} type="button" disabled={saving} onClick={() => onFinish(action.path)}>{action.label}<ArrowUpRight size={12} aria-hidden="true" /></button>)}</div>}
      </div>
      <footer><button type="button" className="guided-tour-skip" disabled={saving} onClick={close}>Not now</button><div><button type="button" className="guided-tour-back" disabled={saving || stepIndex === 0} onClick={() => onStep(stepIndex - 1)}><ArrowLeft size={13} aria-hidden="true" />Back</button><button type="button" className="guided-tour-next" disabled={saving || !isReady} onClick={() => last ? onFinish(returnTo.current) : onStep(stepIndex + 1)}>{saving ? 'Finishing…' : last ? 'Finish tour' : 'Next'}{last ? <Check size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}</button></div></footer>
    </section>
  </div>, document.body);
}
