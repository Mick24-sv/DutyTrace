import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Camera, Check, ChevronRight, CircleUserRound, Mail, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { apiDelete, apiPatch, apiUpload } from '../../services/api.js';
import UserAvatar from '../../components/ui/UserAvatar.jsx';
import './admin-profile.css';

const SECTIONS = [{ id: 'profile', label: 'Personal profile', icon: UserRound }, { id: 'account', label: 'Account details', icon: SlidersHorizontal }, { id: 'security', label: 'Security', icon: ShieldCheck }];

export default function AdminProfilePage() {
  const { user, refreshUser } = useAuth();
  const [section, setSection] = useState('profile');
  const [name, setName] = useState(user.fullName);
  const [savedName, setSavedName] = useState(user.fullName);
  const [savedPhoto, setSavedPhoto] = useState(user.photoUrl);
  const [photo, setPhoto] = useState(null); // null: unchanged; File: upload; 'remove': delete.
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);
  const formId = useId();
  const nameDirty = name !== savedName;
  const dirty = nameDirty || photo !== null;

  useEffect(() => {
    if (!(photo instanceof File)) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function choosePhoto(file) {
    if (!file) return;
    setError(''); setMessage('');
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a PNG or JPEG photo up to 2 MB.'); return; }
    setPhoto(file);
  }
  function discard() { setName(savedName); setPhoto(null); setError(''); setMessage('Changes discarded.'); }
  async function save(event) {
    event.preventDefault();
    if (busy || !dirty) return;
    if (!name.trim()) { setSection('profile'); setError('Please enter your full name.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (nameDirty) {
        const result = await apiPatch('/users/me/admin-profile', { fullName: name.trim() });
        setSavedName(result.user.fullName); setName(result.user.fullName);
      }
      if (photo !== null) {
        const result = photo === 'remove' ? await apiDelete('/users/me/photo') : await apiUpload('/users/me/photo', photo);
        setSavedPhoto(result.user.photoUrl); setPhoto(null);
      }
      try {
        await refreshUser();
        setMessage('Your profile has been updated.');
      } catch {
        setMessage('Your profile was saved. Reload the page to update your account menu.');
      }
    } catch (err) { setError(err.details ? Object.values(err.details).join(' ') : err.message); }
    finally { setBusy(false); }
  }

  return <div className="admin-profile-page">
    <div className="admin-profile-breadcrumb">Account <ChevronRight size={12} aria-hidden="true" /><span>Profile settings</span></div>
    <header className="admin-profile-heading"><div><p>YOUR ACCOUNT</p><h1>Profile settings</h1><span>A few details that make your workspace feel like you.</span></div><span className="admin-profile-role"><ShieldCheck size={14} />Administrator</span></header>
    <div className="admin-profile-layout">
      <nav className="admin-profile-nav" aria-label="Profile sections"><span>SETTINGS</span>{SECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}><Icon size={17} aria-hidden="true" />{label}{section === id && <ChevronRight size={14} aria-hidden="true" />}</button>)}<div className="admin-profile-nav-note"><ShieldCheck size={19} /><p>Your account.<br />Your personal space.</p></div></nav>
      <div className="admin-profile-card-wrap">
        <form id={formId} onSubmit={save} className="admin-profile-card">
          <header><span className="admin-profile-section-icon">{section === 'security' ? <ShieldCheck size={21} /> : section === 'account' ? <SlidersHorizontal size={21} /> : <CircleUserRound size={21} />}</span><div><h2>{SECTIONS.find(item => item.id === section).label}</h2><p>{section === 'profile' ? 'Manage how you appear across DutyTrace.' : section === 'account' ? 'Your sign-in details and workspace access.' : 'Keep access to your account secure.'}</p></div></header>
          <fieldset disabled={busy} className="admin-profile-card-body">
            {section === 'profile' && <>
              <div className="admin-profile-photo-row"><div className="admin-profile-photo">{preview ? <img src={preview} alt="New profile photo preview" /> : <UserAvatar user={{ ...user, fullName: name || savedName, photoUrl: photo === 'remove' ? null : savedPhoto }} className="h-20 w-20 text-xl" />}<span><Camera size={12} aria-hidden="true" /></span></div><div><h3>Profile photo</h3><p>PNG or JPG. Maximum size 2 MB.</p><div className="admin-profile-photo-actions"><button type="button" onClick={() => inputRef.current.click()}>Change photo</button>{(savedPhoto || photo instanceof File) && <button type="button" aria-label="Remove profile photo" onClick={() => { setPhoto(savedPhoto ? 'remove' : null); setError(''); setMessage(''); }}><Trash2 size={14} />Remove</button>}</div><input ref={inputRef} type="file" hidden accept="image/png,image/jpeg" aria-label="Choose profile photo" onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = ''; }} /></div></div>
              <div className="admin-profile-divider" />
              <label>Full name<input required maxLength={120} autoComplete="name" value={name} onChange={event => { setName(event.target.value); setError(''); setMessage(''); }} /><span>Your name appears on your profile and administrative activity.</span></label>
              <label>Email address<div className="admin-profile-email"><Mail size={16} aria-hidden="true" /><input type="email" readOnly value={user.email} autoComplete="email" /></div><span>This is the email you use to sign in.</span></label>
            </>}
            {section === 'account' && <><label>Email address<input readOnly value={user.email} /></label><label>Account role<input readOnly value="Administrator" /></label><label>Institution<input readOnly value={user.institution?.name || 'Not assigned'} /></label><p className="admin-profile-account-note">Your role and institution determine which records and administrative tools you can access.</p></>}
            {section === 'security' && <div className="admin-profile-security"><ShieldCheck size={30} /><h3>Password and sign-in</h3><p>Use the secure password reset process to choose a new password for your account.</p><Link to="/forgot-password">Reset password<ArrowUpRight size={15} /></Link></div>}
          </fieldset>
          <footer><ShieldCheck size={13} aria-hidden="true" />Your personal details are handled securely.</footer>
        </form>
        {error && <p className="admin-profile-error" role="alert">{error}</p>}
        {message && <p className="admin-profile-message" role="status"><Check size={15} aria-hidden="true" />{message}</p>}
        <p className="admin-profile-footnote">Your profile belongs to your {user.institution?.name || 'DutyTrace'} account.</p>
      </div>
    </div>
    <div className={`admin-profile-savebar${dirty ? ' is-visible' : ''}`} inert={dirty ? undefined : ''} aria-hidden={!dirty}>
      <div><span className="admin-profile-unsaved-dot" /><p role="status">You have unsaved changes<span>Save your updates before you leave.</span></p></div>
      <div><button type="button" disabled={busy} onClick={discard}>Discard</button><button type="submit" form={formId} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}{!busy && <Check size={15} aria-hidden="true" />}</button></div>
    </div>
  </div>;
}
