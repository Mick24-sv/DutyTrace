import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { apiDelete } from '../../services/api.js';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

const clock = time => { const [hour, minute] = time.split(':'); return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`; };

export default function AgendaPersonalEvents({ events, loading, error, onEdit }) {
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  async function remove() {
    setBusy(true); setActionError('');
    try {
      await apiDelete(`/duty-schedules/agenda/events/${deleting.id}`);
      setDeleting(null);
      window.dispatchEvent(new Event('agenda-events-changed'));
    } catch (err) { setActionError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="agenda-personal-events" aria-label="Your personal events">
    <h3>Personal events <span>Only you</span></h3>
    {loading ? <p role="status">Loading personal events…</p> : error ? <p role="alert">Could not load personal events. Try again later.</p> : events.length === 0 ? <p>No personal events for this day.</p> : <ul>{events.map(event => <li key={event.id}>
      <div className="agenda-personal-event-details"><h4>{event.title}</h4><p>{event.allDay ? 'All day' : `${clock(event.startsAt)} – ${clock(event.endsAt)}`}</p>{event.notes && <p className="agenda-personal-event-notes">{event.notes}</p>}</div>
      <div className="agenda-personal-event-actions"><button type="button" aria-label={`Edit ${event.title}`} onClick={() => onEdit(event)}><Pencil size={14} /></button><button type="button" aria-label={`Delete ${event.title}`} onClick={() => { setActionError(''); setDeleting(event); }}><Trash2 size={14} /></button></div>
    </li>)}</ul>}
    {createPortal(<ConfirmDialog open={Boolean(deleting)} title="Delete personal event?" confirmLabel="Delete event" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}><p>Delete “{deleting?.title}” from your agenda?</p>{actionError && <p role="alert" className="agenda-event-error">{actionError}</p>}</ConfirmDialog>, document.body)}
  </section>;
}
