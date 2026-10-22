import { AppError } from '../../utils/response.js';

export const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.');

// `rec` has user_id, office_id and institution_id (the student, office and tenant on the record).
//   student    : only their own records
//   supervisor : only records whose office is THEIR current office, and never their own
//   admin      : records in their own institution (what they may DO is decided by each action)
export function canView(user, rec) {
  if (!rec) return false;
  if (user.role === 'admin') return Boolean(user.institutionId) && rec.institution_id === user.institutionId;
  if (user.role === 'student') return rec.user_id === user.id;
  return user.role === 'supervisor' && Boolean(user.office) && rec.office_id === user.office.id && rec.user_id !== user.id;
}

// Unknown ids and other people's ids give the same answer, so ids can't be probed.
export function assertCanView(user, rec) {
  if (!canView(user, rec)) throw forbidden();
}

export const isOfficeSupervisor = (user, rec) =>
  user.role === 'supervisor' && Boolean(user.office) && rec.office_id === user.office.id && rec.user_id !== user.id;

export const isOwner = (user, rec) => user.role === 'student' && rec.user_id === user.id;

// 'YYYY-MM-DD' strings only; rejects impossible dates such as 2026-02-31.
export const isDateKey = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
