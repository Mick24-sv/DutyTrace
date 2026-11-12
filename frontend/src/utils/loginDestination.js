import { ROLE_CONFIG } from '../routes/navConfig.js';

export function loginDestination(role, from) {
  const base = ROLE_CONFIG[role].base;
  return typeof from === 'string' && (from === base || from.startsWith(`${base}/`) || from.startsWith(`${base}?`) || from.startsWith(`${base}#`)) ? from : base;
}
