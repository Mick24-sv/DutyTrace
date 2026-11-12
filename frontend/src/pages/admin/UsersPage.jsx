import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import {useAuth} from '../../hooks/useAuth.jsx';
import StudentPortraitCarousel from '../../components/dashboard/StudentPortraitCarousel.jsx';
import OfficeSupervisorSpotlight from '../../components/dashboard/OfficeSupervisorSpotlight.jsx';
import {Users as UIActionUsers,PlusCircle as UIActionPlusCircle} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { ChevronDown, Eye, EyeOff, Search, UserRound, ArrowUpRight, GraduationCap, Briefcase, ShieldCheck, Pencil, Check, X } from 'lucide-react';
import AccountRowActions from '../../components/ui/AccountRowActions.jsx';
import { DirectoryIdentity, DirectoryStatus, OfficeAssignmentSelect } from '../../components/ui/UserDirectoryCells.jsx';
import UserAvatar from '../../components/ui/UserAvatar.jsx';
import './users-directory.css';
import DataTable from '../../components/ui/DataTable.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPatch, apiPost, apiPut, apiGet, apiDelete } from '../../services/api.js';
import { ROLE_CONFIG } from '../../routes/navConfig.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const PAGE_SIZE = 7;
const USER_GROUPS = [
  {role:'student',label:'Student Assistants',icon:GraduationCap},
  {role:'supervisor',label:'Office Supervisors',icon:Briefcase},
  {role:'admin',label:'Administrators',icon:ShieldCheck},
];

function StudentHoursInput({ user, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(user.requiredHours != null ? String(user.requiredHours) : '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const saved = await onUpdate(val.trim() === '' ? null : Number(val));
      if (saved !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if(user.archivedAt)return <span className="text-sm text-muted">{user.requiredHours!=null?user.requiredHours+' hrs':'Not assigned'}</span>;
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setVal(user.requiredHours != null ? String(user.requiredHours) : ''); setEditing(true); }}
        className="directory-hours-button"
        title="Edit this student's requirement for the selected semester"
      >
        {user.requiredHours != null ? (
          <span className="font-semibold text-ink">{user.requiredHours} hrs</span>
        ) : (
          <span className="text-xs text-muted italic">Not assigned</span>
        )}
        <Pencil size={12} aria-hidden="true" />
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="directory-hours-editor">
      <input
        aria-label={'Semester duty-hour target for '+user.fullName}
        type="number"
        step="0.01"
        min="0.01"
        max="10000"
        placeholder="Not assigned"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        disabled={saving} className="directory-hours-input"
      />
      <button
        type="submit"
        disabled={saving}
        aria-label="Save semester target" className="directory-hours-save"
      >
        {saving ? '…' : <Check size={14} aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving} aria-label="Cancel target edit" className="directory-hours-cancel"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </form>
  );
}

// Administrators create accounts, assign people to offices and enable/disable accounts.
export default function UsersPage() {
  const {user:currentUser}=useAuth();
  const [showArchived,setShowArchived]=useState(false);
  const [accountAction,setAccountAction]=useState(null);
  const [accountBusy,setAccountBusy]=useState(false);
  const [accountError,setAccountError]=useState('');
  const [eligibility,setEligibility]=useState(null);
  const [confirmation,setConfirmation]=useState('');
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useApiData(`/users?_=${tick}&archived=${showArchived}`);
  const offices = useApiData('/offices');
  const termsQuery=useApiData('/semesters');
  const currentTermQuery=useApiData('/semesters/current');
  const [selectedTermId,setSelectedTermId]=useState('');
  const semesterId=selectedTermId||currentTermQuery.data?.term?.id||'';
  const semesterRequirements=useApiData(semesterId?'/semesters/'+semesterId+'/requirements?refresh='+tick:null);
  const requirementsByStudent=new Map((semesterRequirements.data?.requirements??[]).map(r=>[r.id,r]));
  useEffect(()=>{const refresh=()=>setTick(value=>value+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'student', password: '', officeId: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowError, setRowError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('student');
  const [page, setPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reload = () => setTick((t) => t + 1);
  const officeList = offices.data?.offices ?? [];
  const filteredUsers = (data?.users ?? []).filter((user) => {
    if(user.role!==selectedRole) return false;
    const query = userSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [user.fullName, user.email, ROLE_CONFIG[user.role]?.label, user.office?.name, user.status]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(query));
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE)));
  const visibleUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groupLabel = USER_GROUPS.find(group=>group.role===selectedRole).label;
  const selectGroup = role => {setSelectedRole(role);setUserSearch('');setPage(1);setExpandedUserId(null);setRowError('');};
  const changePage = (nextPage) => { setPage(nextPage); setExpandedUserId(null); };

  async function create(e) {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      await apiPost('/users', {
        ...form,
        officeId: form.role === 'admin' || !form.officeId ? undefined : form.officeId,
      });
      setShowArchived(false);
      selectGroup(form.role);
      setForm({ email: '', fullName: '', role: 'student', password: '', officeId: '' });
      reload();
    } catch (err) { setFormError(err.details ? Object.values(err.details).join(' ') : err.message); } finally { setBusy(false); }
  }

  async function act(fn) {
    setRowError('');
    try { await fn(); reload(); return true; } catch (err) { setRowError(err.message); return false; }
  }

  async function openAccountAction(type,user){
    setAccountAction({type,user});setAccountError('');setConfirmation('');setEligibility(null);
    if(type==='delete'){
      setAccountBusy(true);
      try{setEligibility(await apiGet('/users/'+user.id+'/deletion-eligibility'));}catch(err){setAccountError(err.message);}finally{setAccountBusy(false);}
    }
  }
  async function confirmAccountAction(){
    setAccountBusy(true);setAccountError('');
    try{
      const {type,user}=accountAction;
      if(type==='delete')await apiDelete('/users/'+user.id,{body:{confirmation}});
      else await apiPost('/users/'+user.id+'/'+type,{});
      setAccountAction(null);setExpandedUserId(null);reload();
    }catch(err){setAccountError(err.message);}finally{setAccountBusy(false);}
  }
  const accountActions=u=><AccountRowActions user={u} self={u.id===currentUser.id} onToggle={()=>act(()=>apiPatch('/users/'+u.id,{status:u.status==='active'?'disabled':'active'}))} onAction={type=>openAccountAction(type,u)}/>;

  const semesterHours=u=>{
    if(currentTermQuery.loading||semesterRequirements.loading)return <span className="text-xs text-muted">Loading requirement?</span>;
    if(currentTermQuery.error||semesterRequirements.error)return <span className="text-xs text-bad-fg">Unable to load requirement</span>;
    if(!semesterId)return <span className="text-xs text-muted">Select an academic term</span>;
    const requirement=requirementsByStudent.get(u.id);
    const term=(termsQuery.data?.terms??[]).find(t=>t.id===semesterId);
    const hours=requirement?.requiredHours??null;
    if(u.archivedAt||term?.finalizedAt)return <span className="text-sm font-semibold">{hours==null?'Not assigned':hours+' hrs'}</span>;
    const officeId=requirement?.officeId||u.office?.id;
    if(!officeId)return <span className="text-xs text-muted">Assign an office first</span>;
    return <StudentHoursInput key={u.id+':'+semesterId} user={{...u,requiredHours:hours}} onUpdate={value=>act(()=>apiPut('/semesters/'+semesterId+'/requirements/'+u.id,{officeId,requiredHours:value}))}/>;
  };

  const columns = [
    { key: 'fullName', header: 'Name & email', render:u=><DirectoryIdentity user={u}/> },
    { key: 'role', header: 'Role', render: (u) => ROLE_CONFIG[u.role].label },
    {
      key: 'office', header: 'Office',
      render: (u) => <OfficeAssignmentSelect user={u} offices={officeList} onChange={officeId=>act(()=>apiPut(`/users/${u.id}/assignment`,{officeId}))}/>,
    },
    {key:'semesterRequiredHours',header:'Semester target',render:u=>semesterHours(u)},
    { key: 'status', header: 'Status', render: (u) => <DirectoryStatus user={u}/> },
    {key:'action',header:'Actions',render:u=>accountActions(u)},
  ].filter(column=>column.key!=='role' && (column.key!=='office'||selectedRole!=='admin') && (column.key!=='semesterRequiredHours'||selectedRole==='student'));

  return (
    <>
      <ConfirmDialog open={Boolean(accountAction)} title={accountAction?.type==='delete'?'Delete unused account permanently?':accountAction?.type==='restore'?'Restore account?':'Archive account?'} confirmLabel={accountAction?.type==='delete'?'Delete permanently':accountAction?.type==='restore'?'Restore account':'Archive account'} busy={accountBusy} confirmDisabled={Boolean(accountError)||(accountAction?.type==='delete'&&(!eligibility?.canDelete||confirmation!==accountAction.user.email))} onCancel={()=>setAccountAction(null)} onConfirm={confirmAccountAction}>
        <p className="font-medium text-ink">{accountAction?.user.fullName}</p>
        {accountAction?.type==='delete'?<>
          <p className="mt-2">Permanent deletion removes this unused account and its office assignment. This cannot be undone.</p>
          {eligibility&&!eligibility.canDelete&&<p className="mt-3 text-bad-fg">This account has sign-in activity or linked records. Archive it to preserve its history.</p>}
          {eligibility?.canDelete&&<label className="mt-3 block">Type <strong className="break-all">{accountAction.user.email}</strong> to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink"/></label>}
        </>:<p className="mt-2">{accountAction?.type==='restore'?'Restore this account to the current list and its previous active or disabled state.':"Archive this account to block sign-in and hide it from current lists. Attendance, DTRs, concerns, and history will be preserved."}</p>}
        {accountError&&<p role="alert" className="mt-3 text-bad-fg">{accountError}</p>}
      </ConfirmDialog>
      <PageHeader icon={UIActionUsers} title="Students & Staff" description="Open a student's name to view their profile and progress. Manage accounts, office assignments, and each student's semester duty-hour target here." />
      <div role="note" className="mb-4 rounded-lg bg-info-bg p-3 text-sm text-info-fg">Semester targets use the same saved requirements as <Link to="/admin/semesters" className="font-medium underline">Academic Terms</Link>, student progress, and supervisor reports.</div>
      <Card title="Create an account" className="mb-6">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="mb-1 block text-xs font-medium text-muted">Full name</label>
            <input id="u-name" value={form.fullName} onChange={set('fullName')} required className={field} />
          </div>
          <div>
            <label htmlFor="u-email" className="mb-1 block text-xs font-medium text-muted">Email</label>
            <input id="u-email" type="email" value={form.email} onChange={set('email')} required className={field} />
          </div>
          <div>
            <label htmlFor="u-role" className="mb-1 block text-xs font-medium text-muted">Role</label>
            <select id="u-role" value={form.role} onChange={set('role')} className={field}>
              {Object.entries(ROLE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="u-office" className="mb-1 block text-xs font-medium text-muted">Office</label>
            <select id="u-office" value={form.officeId} onChange={set('officeId')} disabled={form.role === 'admin'} className={field}>
              <option value="">Not assigned</option>
              {officeList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="u-pass" className="mb-1 block text-xs font-medium text-muted">Temporary password (at least 10 characters)</label>
            <div className="relative">
              <input
                id="u-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                required
                minLength={10}
                className={`${field} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none focus-visible:text-teal"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">Tell the person their password privately. There is no password-reset flow yet.</p>
          </div>
          {formError && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg sm:col-span-2">{formError}</p>}
          <div className="sm:col-span-2"><Button icon={UIActionPlusCircle} type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button></div>
        </form>
      </Card>
      <Card title="Users by role">
        {loading && <p role="status" className="text-sm text-muted">Loading users…</p>}
        {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
        {rowError && <p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{rowError}</p>}
        {data && (
          <>
            <nav aria-label="User role groups" className="mb-5 grid gap-2 sm:grid-cols-3">
              {USER_GROUPS.map(({role,label,icon:Icon})=><button key={role} type="button" aria-pressed={selectedRole===role} onClick={()=>selectGroup(role)}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${selectedRole===role?'border-teal bg-teal text-white':'border-line bg-surface text-ink hover:bg-canvas'}`}>
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0"/><span className="min-w-0 flex-1">{label}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${selectedRole===role?'bg-white/20':'bg-canvas text-muted'}`}>{data.users.filter(user=>user.role===role).length}</span>
              </button>)}
            </nav>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-navy">{groupLabel}</h3><label className="text-xs text-muted">Accounts<select value={showArchived?'archived':'current'} onChange={e=>{setShowArchived(e.target.value==='archived');setPage(1);setExpandedUserId(null);}} className="ml-2 min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink"><option value="current">Current accounts</option><option value="archived">Archived accounts</option></select></label></div>
            {selectedRole==='student'&&<label className="mb-4 block max-w-sm text-xs text-muted">Academic term<select value={semesterId} onChange={e=>setSelectedTermId(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink"><option value="" disabled>Select an academic term</option>{(termsQuery.data?.terms??[]).map(term=><option key={term.id} value={term.id}>{term.academicYear} ? {term.semester}{term.id===currentTermQuery.data?.term?.id?' (Current)':''}</option>)}</select></label>}
            <label htmlFor="user-search" className="sr-only">Search {groupLabel.toLowerCase()}</label>
            <div className="relative mb-3 w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="user-search"
                type="search"
                value={userSearch}
                onChange={(event) => { setUserSearch(event.target.value); setPage(1); setExpandedUserId(null); }}
                placeholder={`Search ${groupLabel.toLowerCase()} by name or email`}
                className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
            {!showArchived && selectedRole==='student' && visibleUsers.length>0 && <StudentPortraitCarousel students={visibleUsers} />}
            {!showArchived && selectedRole==='supervisor' && <OfficeSupervisorSpotlight supervisors={visibleUsers} />}
            <div className={`users-directory-table is-${selectedRole} hidden sm:block`}>
              <DataTable columns={columns} rows={visibleUsers} caption={groupLabel} empty={userSearch ? `No matching ${groupLabel.toLowerCase()}.` : `No ${groupLabel.toLowerCase()} yet.`} />
            </div>
            <div className="users-directory-mobile divide-y divide-line sm:hidden">
              {filteredUsers.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted">{userSearch ? `No matching ${groupLabel.toLowerCase()}.` : `No ${groupLabel.toLowerCase()} yet.`}</p>
              ) : visibleUsers.map((user) => (
                <article key={user.id} className="py-2 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    aria-expanded={expandedUserId === user.id}
                    aria-controls={`user-details-${user.id}`}
                    onClick={() => setExpandedUserId((current) => current === user.id ? null : user.id)}
                    className="flex min-h-12 w-full items-center gap-2 rounded-md py-1 text-left hover:bg-canvas/60 focus-visible:outline-offset-2"
                  >
                    <UserAvatar user={user} className="h-11 w-11 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-ink">{user.fullName}</span>
                      <span className="block break-all text-xs text-muted">{user.email}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-ink">{ROLE_CONFIG[user.role].label}</span>
                        <DirectoryStatus user={user}/>
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${expandedUserId === user.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {expandedUserId === user.id && <div id={`user-details-${user.id}`} className="mt-2 space-y-2 border-t border-line pt-2 pl-1">
                    {user.role==='student'&&<Link to={`/admin/users/${user.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-teal"><UserRound aria-hidden="true" className="h-4 w-4"/>View student overview<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></Link>}
                    {user.role!=='admin'&&<div className="col-span-2 min-w-0">
                      <p className="mb-1 text-xs text-muted">Office</p>
                      <OfficeAssignmentSelect user={user} offices={officeList} onChange={officeId=>act(()=>apiPut(`/users/${user.id}/assignment`,{officeId}))}/>
                    </div>}
                    {user.role === 'student' && (
                      <div>
                        <p className="mb-1 text-xs text-muted">Semester duty-hour target</p>
                        {semesterHours(user)}
                      </div>
                    )}

                  {accountActions(user)}
                  </div>}
                </article>
              ))}
            </div>
            <Pagination page={currentPage} total={filteredUsers.length} pageSize={PAGE_SIZE} onPageChange={changePage} disabled={loading} label={`${groupLabel} pagination`} recordLabel={groupLabel} />
          </>
        )}
      </Card>
    </>
  );
}
