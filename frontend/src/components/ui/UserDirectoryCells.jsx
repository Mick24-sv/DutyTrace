import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Check, CirclePause, Archive } from 'lucide-react';
import UserAvatar from './UserAvatar.jsx';

export function DirectoryIdentity({ user }) {
  return <div className="directory-identity"><UserAvatar user={user} className="h-11 w-11 text-xs" /><div>{user.role === 'student' ? <Link to={`/admin/users/${user.id}`}>{user.fullName}<ArrowUpRight size={13} aria-hidden="true" /></Link> : <strong>{user.fullName}</strong>}<span title={user.email}>{user.email}</span></div></div>;
}

export function DirectoryStatus({ user }) {
  const state = user.archivedAt ? 'archived' : user.status;
  const Icon = state === 'active' ? Check : state === 'archived' ? Archive : CirclePause;
  return <span className={`directory-status is-${state}`}><Icon size={11} aria-hidden="true" />{state === 'active' ? 'Active' : state === 'archived' ? 'Archived' : 'Disabled'}</span>;
}

export function OfficeAssignmentSelect({ user, offices, onChange }) {
  return <div className="directory-office-select"><Building2 size={14} aria-hidden="true" /><select disabled={Boolean(user.archivedAt)} aria-label={`Office for ${user.fullName}`} value={user.office?.id ?? ''} title={user.office?.name || 'Not assigned'} onChange={event => onChange(event.target.value || null)}><option value="">Not assigned</option>{offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></div>;
}
