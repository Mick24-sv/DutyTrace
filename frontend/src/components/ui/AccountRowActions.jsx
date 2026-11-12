import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ChevronDown, Ellipsis, PauseCircle, PlayCircle, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';

export default function AccountRowActions({ user, self, onToggle, onAction }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const anchor = trigger.current.getBoundingClientRect();
    const bounds = menu.current.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(window.innerWidth - bounds.width - 12, anchor.right - bounds.width)),
      top: anchor.bottom + bounds.height + 8 <= window.innerHeight - 12 ? anchor.bottom + 8 : Math.max(12, anchor.top - bounds.height - 8) });
  }, [open]);
  useLayoutEffect(() => {
    if (open && position) menu.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [open, position]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    const close = event => { if (!menu.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'Tab') setOpen(false);
  }
  async function toggle() {
    setOpen(false); setBusy(true);
    try { await onToggle(); } finally { setBusy(false); }
  }
  function action(type) { setOpen(false); onAction(type); }
  if (self) return <span className="directory-self"><ShieldCheck size={13} aria-hidden="true" />Your account</span>;
  return <>
    <button ref={trigger} type="button" className="directory-manage" disabled={busy} aria-label={`Manage account: ${user.fullName}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><Ellipsis size={16} aria-hidden="true" />{busy ? 'Updating…' : 'Manage'}<ChevronDown size={12} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} role="menu" aria-label={`Account actions for ${user.fullName}`} className="directory-account-menu" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }} onKeyDown={keyboard}>
      <div className="directory-menu-heading"><span>ACCOUNT ACTIONS</span><strong>{user.fullName}</strong></div>
      {user.archivedAt ? <button type="button" role="menuitem" onClick={() => action('restore')}><span className="directory-menu-icon is-enable"><RotateCcw size={17} /></span><span>Restore account<small>Return to the current account list</small></span></button> : <>
        <button type="button" role="menuitem" onClick={toggle}><span className={`directory-menu-icon ${user.status === 'active' ? 'is-disable' : 'is-enable'}`}>{user.status === 'active' ? <PauseCircle size={17} /> : <PlayCircle size={17} />}</span><span>{user.status === 'active' ? 'Disable account' : 'Enable account'}<small>{user.status === 'active' ? 'Temporarily block sign-in' : 'Allow this user to sign in'}</small></span></button>
        <button type="button" role="menuitem" onClick={() => action('archive')}><span className="directory-menu-icon is-archive"><Archive size={17} /></span><span>Archive account<small>Hide from current lists; keep records</small></span></button>
      </>}
      <div className="directory-menu-divider" /><button type="button" role="menuitem" className="directory-menu-delete" onClick={() => action('delete')}><span className="directory-menu-icon is-delete"><Trash2 size={17} /></span><span>Delete unused account<small>Available only without activity or records</small></span></button>
    </div>, document.body)}
  </>;
}
