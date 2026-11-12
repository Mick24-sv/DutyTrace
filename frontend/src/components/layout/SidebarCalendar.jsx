import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, X } from 'lucide-react';
import { useApiData } from '../../hooks/useApiData.js';
import { monthDays, shiftDate, agendaItemsForDay, ROLE_AGENDAS } from '../../utils/sidebarCalendar.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { todayKey } from '../../utils/format.js';
import './sidebar-calendar.css';
import './sidebar-agenda-popup.css';
import AgendaEventEditor from './AgendaEventEditor.jsx';
import AgendaPersonalEvents from './AgendaPersonalEvents.jsx';

const formatDay = key => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${key}T12:00:00Z`));
const clock = time => { const [hour, minute] = time.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`; };

export default function SidebarCalendar({ role, onNavigate }) {
  const { user } = useAuth();
  const agenda = ROLE_AGENDAS[role];
  const today = todayKey(user?.institution?.timezone || 'Asia/Manila');
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const panelId = useId();
  const [editor, setEditor] = useState(null);
  const [eventRevision, setEventRevision] = useState(0);
  const grid = useRef(null);
  const headingId = useId();
  const agendaId = useId();
  const { data, loading, error } = useApiData(`/duty-schedules/agenda?month=${month}`);
  const personal = useApiData(`/duty-schedules/agenda/events?month=${month}&_=${eventRevision}`);
  const personalEvents = personal.data?.month === month ? personal.data.events : [];
  const schedules = data?.month === month ? data.schedules : [];
  const importantItems = data?.month === month ? data.importantItems ?? [] : [];
  const days = monthDays(month);
  const index = days.indexOf(selected);
  const events = agendaItemsForDay(schedules, importantItems, selected, role);
  const scopeLabel = role === 'supervisor' ? user?.office?.name || 'No office assigned' : role === 'admin' ? user?.institution?.name || agenda.scope : agenda.scope;

  useEffect(() => {
    const reload = () => setEventRevision(value => value + 1);
    window.addEventListener('agenda-events-changed', reload);
    return () => window.removeEventListener('agenda-events-changed', reload);
  }, []);

  useEffect(() => {
    if (!calendarOpen) return undefined;
    panel.current?.querySelector('button')?.focus({ preventScroll: true });
    const close = event => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      setCalendarOpen(false); setAgendaOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    const outside = event => {
      if (document.querySelector('dialog[open]') || panel.current?.contains(event.target) || trigger.current?.contains(event.target)) return;
      setCalendarOpen(false); setAgendaOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, [calendarOpen]);

  function select(key) { setSelected(key); setMonth(key.slice(0, 7)); setAgendaOpen(true); }
  function changeMonth(delta) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const nextMonth = date.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    setMonth(nextMonth);
    setSelected(`${nextMonth}-${String(Math.min(Number(selected.slice(-2)), last)).padStart(2, '0')}`);
  }
  function keyboard(event, key) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = shiftDate(key, delta);
    select(next);
    requestAnimationFrame(() => grid.current?.querySelector(`[data-date="${next}"]`)?.focus());
  }

  return (
    <div className="sidebar-agenda-launcher">
      <button ref={trigger} type="button" className="sidebar-agenda-toggle" aria-label="Open agenda" title="Agenda" aria-expanded={calendarOpen} aria-haspopup="dialog" aria-controls={calendarOpen ? panelId : undefined} onClick={() => { setCalendarOpen(value => !value); setAgendaOpen(false); }}>
        <CalendarDays size={20} aria-hidden="true" /><span className="sidebar-link-label">Agenda</span>
      </button>
      {calendarOpen && createPortal(<div ref={panel} id={panelId} role="dialog" aria-label={agenda.heading} className="sidebar-calendar-popup no-print">
      <div className="sidebar-calendar-popup-header"><span>Agenda</span><button type="button" aria-label="Close agenda panel" onClick={() => { setCalendarOpen(false); setAgendaOpen(false); trigger.current?.focus({ preventScroll: true }); }}><X size={18} /></button></div>
    <section className={`sidebar-calendar${agendaOpen ? ' has-agenda' : ''}`} aria-labelledby={headingId}>
      <div className="sidebar-calendar-label"><CalendarDays size={13} aria-hidden="true" /><h2 id={headingId}>{agenda.heading}</h2><button type="button" onClick={() => select(today)}>Today</button></div>
      <p className="sidebar-calendar-scope">{scopeLabel}</p>
      <div className="sidebar-calendar-month"><span aria-live="polite">{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`))}</span><div><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button><button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={16} /></button></div></div>
      <div className="sidebar-calendar-weekdays" aria-hidden="true">{['S','M','T','W','T','F','S'].map((day, i) => <span key={i}>{day}</span>)}</div>
      <div className="sidebar-calendar-grid" ref={grid} role="group" aria-label="Choose agenda date">
        <span className="sidebar-calendar-ring" aria-hidden="true" style={{ left: `${(index % 7) * 100 / 7}%`, top: `${Math.floor(index / 7) * 44}px` }} />
        {days.map((key, i) => {
          if (!key) return <span key={`blank-${i}`} />;
          const count = agendaItemsForDay(schedules, importantItems, key, role).length + personalEvents.filter(event => event.date === key).length;
          return <button key={key} data-date={key} type="button" tabIndex={key === selected ? 0 : -1}
            aria-label={`${formatDay(key)}${count ? `, ${count} agenda ${count === 1 ? 'item' : 'items'}` : ', no agenda items'}`}
            aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} aria-controls={agendaOpen ? agendaId : undefined}
            onClick={() => select(key)} onKeyDown={event => keyboard(event, key)}>
            {Number(key.slice(-2))}{count > 0 && <span className="sidebar-calendar-dot" aria-hidden="true" />}
          </button>;
        })}
      </div>
      <div className="sidebar-calendar-legend"><span /> {role === 'admin' ? agenda.legend : 'Shifts and your personal events'}</div>
      <button type="button" className="sidebar-calendar-add" onClick={() => setEditor({ date: selected, event: null })}><Plus size={14} aria-hidden="true" />Add personal event</button>
      {loading && <p className="sidebar-calendar-message" role="status">Loading agenda…</p>}
      {error && <p className="sidebar-calendar-message" role="alert">Agenda unavailable. Try again later.</p>}
      {agendaOpen && <>
        <aside id={agendaId} className="sidebar-agenda no-print" aria-label={`${agenda.heading}: ${scopeLabel}`}>
          <button type="button" className="sidebar-agenda-back" onClick={() => { setAgendaOpen(false); requestAnimationFrame(() => grid.current?.querySelector(`[data-date="${selected}"]`)?.focus({ preventScroll: true })); }}><ChevronLeft size={16} aria-hidden="true" />Back to calendar</button>
          <div className="sidebar-agenda-header"><span>{agenda.heading}</span><button type="button" aria-label="Close agenda" onClick={() => { setAgendaOpen(false); grid.current?.querySelector(`[data-date="${selected}"]`)?.focus(); }}><X size={17} /></button></div>
          <div key={selected} className="sidebar-agenda-day">
            <h2>{formatDay(selected)}</h2><p>{scopeLabel} · {events.length} {role === 'admin' ? (events.length === 1 ? 'important item' : 'important items') : (events.length === 1 ? 'shift' : 'shifts')}</p>
            <button type="button" className="sidebar-agenda-add" onClick={() => setEditor({ date: selected, event: null })}><Plus size={14} aria-hidden="true" />Add personal event</button>
            {loading ? <p role="status">Loading agenda…</p> : error ? <p role="alert">Could not load the agenda. Try again later.</p> : events.length ? <ol>{events.map(event => <li key={event.id}><span className="sidebar-agenda-event-dot" /><div>
              <h3>{event.href ? <Link className="sidebar-agenda-item-link" to={event.href} onClick={() => { setAgendaOpen(false); setCalendarOpen(false); onNavigate?.(); }}>{event.title}</Link> : event.title}</h3>
              <p>{event.detail || event.office || 'Assigned office'}</p>
              {event.start && <time><Clock3 size={12} aria-hidden="true" />{clock(event.start)} – {clock(event.end)}</time>}
              {event.kind && <span className="sidebar-agenda-item-kind">{event.kind === 'concern' ? 'Needs attention' : 'Deadline'}</span>}
            </div></li>)}</ol> : <div className="sidebar-agenda-empty"><CalendarDays size={28} strokeWidth={1.3} /><h3>{role === 'admin' ? 'All clear for this day' : role === 'supervisor' && !user?.office ? 'No office assigned' : 'A little breathing room'}</h3><p>{role === 'supervisor' && !user?.office ? 'Your office agenda will appear once you are assigned to an office.' : agenda.empty}</p></div>}
            <AgendaPersonalEvents key={selected} events={personalEvents.filter(event => event.date === selected)} loading={personal.loading} error={personal.error} onEdit={event => setEditor({ date: event.date, event })} />
          </div>
        </aside></>}
      {editor && <AgendaEventEditor date={editor.date} event={editor.event} onCancel={() => setEditor(null)} onSaved={event => {
        setEditor(null); select(event.date); window.dispatchEvent(new Event('agenda-events-changed'));
      }} />}
    </section></div>, document.body)}
    </div>
  );
}
