import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowUpRight, Building2, Search, GraduationCap, Info } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import UserAvatar from '../ui/UserAvatar.jsx';
import Pagination from '../ui/Pagination.jsx';
import './office-coworkers.css';

export function OfficeCoworkersCard({ preview, office, data, loading, error, search, onSearch, page, onPageChange, limit }) {
  const id = useId();
  const people = data?.items ?? [];
  return <section className={`office-coworkers-card${preview ? ' is-preview' : ''}`} aria-labelledby={`${id}-heading`}>
    <header className="office-coworkers-header"><div className="office-coworkers-heading"><span className="office-coworkers-icon"><Users size={20} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>My office Co-Worker Student Assistant</h2><p>Meet the Student Assistants who share your office.</p></div></div>{preview && <Link className="office-coworkers-view" to="/student/co-workers">View co-workers<ArrowUpRight size={14} aria-hidden="true" /></Link>}</header>
    <div className="office-coworkers-body">
      <div className="office-coworkers-context"><span className="office-coworkers-office"><Building2 size={14} aria-hidden="true" />{office?.name || 'No office assigned'}</span>{data && <span className="office-coworkers-count">{data.total} {data.total === 1 ? 'co-worker' : 'co-workers'}{search?.trim() ? ' found' : ''}</span>}</div>
      {!preview && <label className="office-coworkers-search"><span className="sr-only">Search co-worker Student Assistants by name or course</span><Search size={15} aria-hidden="true" /><input type="search" maxLength={100} value={search} onChange={event => onSearch(event.target.value)} placeholder="Search by name or course…" /></label>}
      {loading && <p role="status" className="office-coworkers-empty">Loading your office co-workers…</p>}
      {error && <p role="alert" className="office-coworkers-error">Unable to load co-workers. {error}</p>}
      {!loading && !error && (!office || !people.length) && <div className="office-coworkers-empty"><Users size={26} aria-hidden="true" /><h3>{!office ? 'Your office is not assigned yet' : search?.trim() ? 'No matching co-workers' : 'No other Student Assistants yet'}</h3><p>{!office ? 'Your co-worker Student Assistants will appear once you are assigned to an office.' : search?.trim() ? 'Try a different name or course.' : 'Other active Student Assistants assigned to your office will appear here.'}</p></div>}
      {!loading && !error && people.length > 0 && <ul className="office-coworkers-list">{people.map(person => <li key={person.id}>
        <span className="office-coworker-avatar"><UserAvatar user={person} className="h-12 w-12 text-sm" /></span>
        <div className="office-coworker-info"><div><h3>{person.fullName}</h3><span className="office-coworker-role"><GraduationCap size={12} aria-hidden="true" />Student Assistant</span></div><p>{[person.yearLevel ? `Year ${person.yearLevel}` : null, person.course].filter(Boolean).join(' · ') || 'Assigned to your office'}</p></div>
      </li>)}</ul>}
      {!preview && data && <Pagination page={page} total={data.total} pageSize={limit} onPageChange={onPageChange} disabled={loading} label="Co-worker Student Assistants pagination" recordLabel="Co-workers" />}
    </div>
    <footer className="office-coworkers-footer"><Info size={12} aria-hidden="true" /><span>Only other active Student Assistants assigned to your office are shown.</span></footer>
  </section>;
}

export default function OfficeTeammates({ preview = false }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const limit = preview ? 3 : 12;
  const { data, loading, error } = useApiData(user.office ? `/users/me/teammates?page=${page}&limit=${limit}&search=${encodeURIComponent(query)}` : null);
  if (preview && !user.office) return null;
  return <OfficeCoworkersCard preview={preview} office={user.office} data={data} loading={loading} error={error} search={search} onSearch={setSearch} page={page} onPageChange={setPage} limit={limit} />;
}
