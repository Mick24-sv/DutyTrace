const preferred = ['Asia/Manila', 'UTC'];
const available = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'America/New_York'];

export default function TimezoneSelect({ value, ...props }) {
  const options = [...new Set([...preferred, ...(value ? [value] : []), ...available])];
  return (
    <select {...props} value={value}>
      {options.map((timezone) => (
        <option key={timezone} value={timezone}>
          {timezone === 'Asia/Manila' ? 'Philippine time (UTC+08:00) — Asia/Manila'
            : timezone === 'UTC' ? 'Coordinated Universal Time (UTC)' : timezone.replaceAll('_', ' ')}
        </option>
      ))}
    </select>
  );
}
