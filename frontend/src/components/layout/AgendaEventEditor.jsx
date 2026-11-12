import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiPost, apiPut } from '../../services/api.js';

export default function AgendaEventEditor({ date, event, onCancel, onSaved }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [fields, setFields] = useState(() => ({ title: event?.title ?? '', date: event?.date ?? date,
    allDay: event?.allDay ?? true, startsAt: event?.startsAt ?? '09:00', endsAt: event?.endsAt ?? '10:00', notes: event?.notes ?? '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const update = (name, value) => setFields(current => ({ ...current, [name]: value }));
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!fields.allDay && fields.endsAt <= fields.startsAt) { setError('End time must be after start time.'); return; }
    setBusy(true); setError('');
    const body = { ...fields, startsAt: fields.allDay ? null : fields.startsAt, endsAt: fields.allDay ? null : fields.endsAt };
    try {
      const result = event ? await apiPut(`/duty-schedules/agenda/events/${event.id}`, body) : await apiPost('/duty-schedules/agenda/events', body);
      onSaved(result.event);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return createPortal(<dialog ref={dialog} className="agenda-event-editor" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <form onSubmit={submit}>
      <header><h2 id={titleId}>{event ? 'Edit personal event' : 'Add personal event'}</h2><button type="button" disabled={busy} aria-label="Close event editor" onClick={onCancel}><X size={18} /></button></header>
      <p>Only you can see this event. Times use your institution’s timezone.</p>
      <fieldset disabled={busy}>
        <label>Title<input autoFocus required maxLength={160} value={fields.title} onChange={e => update('title', e.target.value)} /></label>
        <label>Date<input type="date" required min="1000-01-01" max="9999-12-31" value={fields.date} onChange={e => update('date', e.target.value)} /></label>
        <label className="agenda-event-checkbox"><input type="checkbox" checked={fields.allDay} onChange={e => update('allDay', e.target.checked)} />All day</label>
        {!fields.allDay && <div className="agenda-event-times"><label>Start<input type="time" required value={fields.startsAt} onChange={e => update('startsAt', e.target.value)} /></label><label>End<input type="time" required value={fields.endsAt} onChange={e => update('endsAt', e.target.value)} /></label></div>}
        <label>Notes <span>(optional)</span><textarea rows={3} maxLength={2000} value={fields.notes} onChange={e => update('notes', e.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="agenda-event-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy || !fields.title.trim()}>{busy ? 'Saving…' : 'Save event'}</button></footer>
    </form>
  </dialog>, document.body);
}
