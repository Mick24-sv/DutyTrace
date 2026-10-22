import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Settings2, Trash2 } from 'lucide-react';
import { apiGet, apiPatch, apiPut } from '../../services/api.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
];

function notificationPath(role, item) {
  if (typeof item.actionUrl === 'string' && item.actionUrl.startsWith('/') && !item.actionUrl.startsWith('//')) return item.actionUrl;
  const { relatedType, relatedId } = item;
  if (relatedType === 'monthly_dtr') {
    if (role === 'student') return `/student/dtr/${relatedId}`;
    if (role === 'supervisor') return `/supervisor/dtr-review/${relatedId}`;
    return `/admin/dtrs/${relatedId}`;
  }
  if (relatedType === 'absence_notice') return `/${role}/absences/${relatedId}`;
  if (relatedType === 'compliance_case') return `/${role}/cases/${relatedId}`;
  if (relatedType === 'academic_term') return role === 'admin' ? '/admin/semesters' : `/${role}`;
  if (relatedType === 'student') return role === 'admin' ? '/admin/users' : `/${role}/assistants/${relatedId}`;
  if (relatedType === 'duty_schedule') return '/student/schedule';
  if (relatedType === 'duty_recovery_plan') return role === 'student' ? '/student/schedule' : '/supervisor/recovery-review';
  if (relatedType === 'attendance_discrepancy') return `/${role}/discrepancies`;
  return `/${role}`;
}

export default function NotificationCenter({ role }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const wrapRef = useRef(null);
  const filterRef = useRef('all');
  const navigate = useNavigate();

  const load = useCallback(async (selectedFilter = 'all') => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/notifications?filter=${selectedFilter}`);
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('all');
    const timer = window.setInterval(() => load(filterRef.current), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => !wrapRef.current?.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chooseFilter = async (next) => {
    filterRef.current = next;
    setFilter(next);
    await load(next);
  };

  const toggle = () => {
    if (!open) {
      load(filter);
      if (role === 'student') apiGet('/notifications/preferences').then(setPreferences).catch((err) => setError(err.message));
    }
    setOpen((value) => !value);
  };

  const updatePreference = async (key, value) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreferences(true);
    try {
      setPreferences(await apiPut('/notifications/preferences', next));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPreferences(false);
    }
  };

  const openNotification = async (item) => {
    try {
      if (!item.readAt) {
        await apiPatch(`/notifications/${item.id}/read`, {});
        setUnreadCount((count) => Math.max(0, count - 1));
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      }
    } catch (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    navigate(notificationPath(role, item));
  };

  const markAllRead = async () => {
    try {
      await apiPatch('/notifications/read-all', {});
      setUnreadCount(0);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteNotification = async (event, item) => {
    event.stopPropagation();
    setError('');
    setDeletingId(item.id);
    try {
      await apiPatch(`/notifications/${item.id}/dismiss`, {});
      setItems((current) => current.filter((row) => row.id !== item.id));
      if (!item.readAt) setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={toggle}
        className="relative rounded-lg p-2 text-navy hover:bg-canvas"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-bad-fg px-1 text-center text-[10px] font-semibold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section aria-label="Notification center" className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+4rem)] z-40 flex max-h-[calc(100dvh-env(safe-area-inset-top)-5rem)] w-auto flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-[min(24rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div><h2 className="font-semibold text-navy">Notifications</h2><p className="text-xs text-muted">{unreadCount} unread</p></div>
            <button type="button" onClick={markAllRead} disabled={!unreadCount} className="inline-flex items-center gap-1 text-xs font-medium text-teal underline disabled:text-muted disabled:no-underline">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2" role="tablist" aria-label="Filter notifications">
            {FILTERS.map((option) => (
              <button key={option.id} type="button" role="tab" aria-selected={filter === option.id} onClick={() => chooseFilter(option.id)} className={`rounded-full px-3 py-1 text-xs ${filter === option.id ? 'bg-teal text-white' : 'text-muted hover:bg-canvas'}`}>
                {option.label}
              </button>
            ))}
          </div>
          {role === 'student' && (
            <div className="border-b border-line px-3 py-2">
              <button type="button" aria-expanded={showPreferences} onClick={() => setShowPreferences((value) => !value)} className="inline-flex items-center gap-1 text-xs font-medium text-teal">
                <Settings2 className="h-3.5 w-3.5" /> Reminder settings
              </button>
              {showPreferences && preferences && (
                <div className="mt-2 grid gap-2 rounded-lg bg-canvas p-3 text-xs">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" disabled={savingPreferences || !preferences.emailAvailable} checked={preferences.emailReminders} onChange={(event) => updatePreference('emailReminders', event.target.checked)} />
                    <span>Email alerts for institution-enabled high-priority notices{!preferences.emailAvailable && <span className="block text-muted">Email is unavailable until SMTP is configured.</span>}</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" disabled={savingPreferences} checked={preferences.upcomingShiftReminders} onChange={(event) => updatePreference('upcomingShiftReminders', event.target.checked)} />
                    <span>Upcoming approved shift reminders</span>
                  </label>
                </div>
              )}
              {showPreferences && !preferences && <p role="status" className="mt-2 text-xs text-muted">Loading reminder settings…</p>}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto sm:max-h-[min(65vh,28rem)] sm:flex-none">
            {loading && items.length === 0 && <p role="status" className="p-5 text-center text-sm text-muted">Loading notifications…</p>}
            {error && <p role="alert" className="m-3 rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}
            {!loading && !error && items.length === 0 && <p className="p-5 text-center text-sm text-muted">No {filter === 'all' ? '' : `${filter} `}notifications.</p>}
            <ul>
              {items.map((item) => (
                <li key={item.id} className={`flex items-start border-b border-line last:border-0 ${item.readAt ? '' : 'bg-teal/5'}`}>
                  <button type="button" onClick={() => openNotification(item)} className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-canvas">
                    <span className="flex items-start gap-2">
                      {!item.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label="Unread" /> : <span className="w-2 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1 text-sm font-semibold text-ink">{item.title}<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${item.severity === 'critical' ? 'bg-bad-bg text-bad-fg' : item.severity === 'warning' ? 'bg-warn-bg text-warn-fg' : 'bg-info-bg text-info-fg'}`}>{item.severity ?? (item.important ? 'warning' : 'informational')}</span></span>
                        <span className="mt-0.5 block break-words text-xs text-muted">{item.message}</span>
                        <time className="mt-1 block text-[11px] text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                      </span>
                      {!item.readAt && <Check className="mt-1 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss notification: ${item.title}`}
                    title="Dismiss notification"
                    disabled={deletingId === item.id}
                    onClick={(event) => deleteNotification(event, item)}
                    className="m-2 rounded-lg p-2 text-muted hover:bg-bad-bg hover:text-bad-fg disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
