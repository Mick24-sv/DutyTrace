// Formatting helpers. Times from the API are ISO strings (UTC); we show them
// in the timezone the SERVER reports (APP_TIMEZONE), so every user sees the same
// clock regardless of their device settings.

export const formatTime = (iso, timeZone) =>
  iso
    ? new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso))
    : '—';

export const formatDateTime = (iso, timeZone) =>
  iso
    ? new Intl.DateTimeFormat('en-US', {
        timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(new Date(iso))
    : '—';

// 'YYYY-MM-DD' (already a local date from the API) -> 'Tue, Sep 1'
export const formatDateKey = (key) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(`${key}T12:00:00Z`),
  );

// 16200 -> '4 h 30 m'
export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${String(m).padStart(2, '0')} m`;
}

export const formatHours = (hours) => `${Number(hours).toFixed(2)} h`;

// '2026-09' -> 'September 2026'
export const formatMonth = (month) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`));

// Clock time without seconds ('8:00 AM'), for printable records.
export const formatClock = (iso, timeZone) =>
  iso ? new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';

// Today's date as 'YYYY-MM-DD' on the server's clock (APP_TIMEZONE), for default/maximum values in date inputs.
export const todayKey = (timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// 'YYYY-MM-DD' range -> 'Tue, Oct 20' or 'Tue, Oct 20 – Thu, Oct 22'
export const formatDateRange = (start, end) => (start === end ? formatDateKey(start) : `${formatDateKey(start)} – ${formatDateKey(end)}`);

export const formatFileSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
