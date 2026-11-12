import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import { swipeRelease } from '../../utils/inboxSwipe.js';
import './swipeable-inbox-row.css';

export default function SwipeableInboxRow({ children, pinned, archived, onAction, label }) {
  const root = useRef(null);
  const gesture = useRef(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function moveTo(value) { offsetRef.current = value; setOffset(value); }
  async function act(action) {
    if (busy) return;
    setBusy(true); setError('');
    if (action === 'delete') moveTo(-root.current.clientWidth);
    try { await onAction(action); moveTo(0); }
    catch (err) { moveTo(0); setError(err.message || 'Could not update this conversation. Try again.'); }
    finally { setBusy(false); }
  }
  function down(event) {
    if (busy || event.pointerType === 'mouse' || !window.matchMedia('(max-width: 1023px)').matches) return;
    if (event.target.closest('[data-swipe-actions]')) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: offsetRef.current, locked: false };
    suppressClick.current = false;
  }
  function move(event) {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.locked) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
      if (Math.abs(dx) < 8) return;
      drag.locked = true;
      root.current.setPointerCapture(event.pointerId);
      suppressClick.current = true;
      setDragging(true);
    }
    const value = drag.start + dx;
    // Pin has a soft stop; the delete side can travel the full row width.
    moveTo(value > 76 ? 76 + Math.min(24, (value - 76) * .15) : Math.max(-root.current.clientWidth, value));
  }
  function end(event) {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null; setDragging(false);
    if (!drag.locked) return;
    if (event.type === 'pointercancel') { moveTo(0); return; }
    const result = swipeRelease(offsetRef.current, root.current.clientWidth);
    if (result === 'delete') void act('delete');
    else moveTo(result === 'right' ? -152 : result === 'left' ? 76 : 0);
  }
  const armed = offset <= -Math.max(180, (root.current?.clientWidth ?? 320) * .72);
  return (
    <li ref={root} className={`swipe-inbox-row ${dragging ? 'is-dragging' : ''} ${armed ? 'is-delete-armed' : ''}`}
      aria-busy={busy} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onClickCapture={event => { if (suppressClick.current && !event.target.closest('[data-swipe-actions]')) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
      onKeyDown={event => { if (event.key === 'Escape') moveTo(0); }}>
      <div className="swipe-inbox-actions swipe-inbox-left" style={{ visibility: offset > 0 ? 'visible' : 'hidden' }} data-swipe-actions inert={offset <= 0 ? '' : undefined} aria-hidden={offset <= 0}>
        <button disabled={busy} onClick={() => act(pinned ? 'unpin' : 'pin')} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}>{pinned ? <PinOff size={20} /> : <Pin size={20} />}<span>{pinned ? 'Unpin' : 'Pin'}</span></button>
      </div>
      <div className="swipe-inbox-actions swipe-inbox-right" data-swipe-actions inert={offset >= 0 ? '' : undefined} aria-hidden={offset >= 0}>
        <button className="swipe-inbox-archive" disabled={busy} onClick={() => act(archived ? 'unarchive' : 'archive')} aria-label={`${archived ? 'Unarchive' : 'Archive'} ${label}`}>{archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}<span>{archived ? 'Restore' : 'Archive'}</span></button>
        <button className="swipe-inbox-delete" disabled={busy} onClick={() => act('delete')} aria-label={`Delete ${label}`}><Trash2 size={20} /><span>{armed ? 'Release' : 'Delete'}</span></button>
      </div>
      <div className="swipe-inbox-content" style={{ transform: `translateX(${offset}px)` }}>{children}
        <button className="swipe-inbox-more" data-swipe-actions aria-label={`Actions for ${label}`} aria-expanded={offset !== 0} disabled={busy} onClick={() => moveTo(offset ? 0 : -152)}><MoreHorizontal size={18} /></button>
        <button className="swipe-inbox-pin-access" data-swipe-actions disabled={busy} onClick={() => { moveTo(76); }} aria-label={`Show ${pinned ? 'unpin' : 'pin'} action for ${label}`}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
      </div>
      {error && <p role="alert" className="swipe-inbox-error">{error}</p>}
    </li>
  );
}
