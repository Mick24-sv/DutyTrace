import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,CheckCircle2,ChevronRight,KeyRound,Palette,Mail,Send,Settings,ShieldCheck} from 'lucide-react';
import PlatformHeader from './PlatformHeader.jsx';
import {useAuth} from '../../hooks/useAuth.jsx';
import {useApiData} from '../../hooks/useApiData.js';
import {apiPost} from '../../services/api.js';
import Button from '../../components/ui/Button.jsx';
import './platform.css';

function PasswordField({label,value,onChange,autoComplete='current-password',minimum=1}) {
  return <label className="platform-field"><span>{label}</span><input required type="password" autoComplete={autoComplete} minLength={minimum} maxLength={200} value={value} onChange={event=>onChange(event.target.value)}/></label>;
}
export default function AccountSettingsPage() {
  const {user,refreshUser}=useAuth();
  const [token,setToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('verify')??'');
  const [section,setSection]=useState(()=>window.location.hash.includes('verify=')?'email':'password');
  const [revision,setRevision]=useState(0);const {data,loading,error:loadError}=useApiData(`/platform/account?revision=${revision}`);
  const [currentPassword,setCurrentPassword]=useState('');const [newPassword,setNewPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [emailPassword,setEmailPassword]=useState('');const [newEmail,setNewEmail]=useState('');const [verifyPassword,setVerifyPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  useEffect(()=>{
    document.title='Account settings · DutyTrace';
    const captureVerification=()=>{
      const value=new URLSearchParams(window.location.hash.slice(1)).get('verify');
      if(value){setToken(value);setSection('email');setError('');setMessage('');}
      window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
    };
    captureVerification();window.addEventListener('hashchange',captureVerification);
    return ()=>window.removeEventListener('hashchange',captureVerification);
  },[]);
  async function savePassword(event) {
    event.preventDefault();setError('');setMessage('');
    if(newPassword!==confirm){setError('The new passwords do not match.');return;}
    setBusy(true);
    try{await apiPost('/platform/account/password',{currentPassword,newPassword});setCurrentPassword('');setNewPassword('');setConfirm('');setToken('');setRevision(value=>value+1);setMessage('Password updated. Other sessions were signed out. You can continue using this session.');}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function requestEmail(event) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try{await apiPost('/platform/account/email',{currentPassword:emailPassword,newEmail});setEmailPassword('');setNewEmail('');setToken('');setRevision(value=>value+1);setMessage('Verification instructions were handed to the email provider. Open the link in your new inbox within 30 minutes. Your current email remains active.');}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function verifyEmail(event) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try{await apiPost('/platform/account/email/confirm',{token,currentPassword:verifyPassword});setToken('');setVerifyPassword('');await refreshUser();setRevision(value=>value+1);setMessage('Your new email is verified and active. Other sessions were signed out. Use the new address next time you sign in.');}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function cancelEmail() {
    setBusy(true);setError('');setMessage('');
    try{await apiPost('/platform/account/email/cancel',{});setToken('');setRevision(value=>value+1);setMessage('Email change cancelled. Your current email stays active.');}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  function select(value){setSection(value);setError('');setMessage('');}
  return <div className="platform-shell"><PlatformHeader/><main className="platform-main platform-account-main"><Link className="platform-account-back" to="/superadmin"><ArrowLeft size={15}/>Back to institutions</Link><div className="platform-breadcrumb"><Settings size={13}/>Platform<ChevronRight size={12}/>Account settings</div><div className="platform-page-heading"><div><p className="platform-eyebrow">YOUR PLATFORM ACCOUNT</p><h1>Account settings</h1><p>Manage your sign-in details and keep your maintainer account secure.</p></div></div><div className="platform-account-layout"><aside><div className="platform-account-identity"><span className="platform-icon violet"><ShieldCheck size={25}/></span><h2>{user?.fullName}</h2><p>{user?.email}</p><span className="platform-status violet">Platform Superadmin</span></div><nav className="platform-account-nav" aria-label="Account settings sections"><button aria-current={section==='password'?'page':undefined} onClick={()=>select('password')} disabled={busy}><KeyRound size={17}/>Password<ChevronRight size={14}/></button><button aria-current={section==='email'?'page':undefined} onClick={()=>select('email')} disabled={busy}><Mail size={17}/>Email address<ChevronRight size={14}/></button><Link className="platform-appearance-nav-link" to="/superadmin/appearance"><Palette size={17}/>Appearance<ChevronRight size={14}/></Link></nav></aside><section className="platform-account-card" aria-labelledby="account-section-title"><header><span className={`platform-icon ${section==='password'?'blue':'teal'}`}>{section==='password'?<KeyRound size={23}/>:<Mail size={23}/>}</span><div><h2 id="account-section-title">{section==='password'?'Change password':'Email address'}</h2><p>{section==='password'?'Choose a strong password that you don’t use elsewhere.':'Verify your new address before changing where you sign in.'}</p></div></header><div className="platform-account-body">
    {loading?<p role="status">Loading account details…</p>:loadError?<p role="alert" className="platform-error">{loadError}</p>:section==='password'?<form onSubmit={savePassword}><fieldset disabled={busy}><PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword}/><PasswordField label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minimum={10}/><PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" minimum={10}/><p className="platform-inline-note"><ShieldCheck size={15}/>Use at least 10 characters. Updating your password also cancels pending email changes and old password-reset links.</p></fieldset><Button type="submit" variant="accent" icon={KeyRound} disabled={busy}>{busy?'Updating…':'Update password'}</Button></form>:<>
      <div className="platform-account-current"><CheckCircle2 size={19}/><div><small>Current sign-in email</small><strong>{data?.email??user?.email}</strong></div><span>Active</span></div>
      {data?.pendingEmail&&<div className="platform-account-pending"><Mail size={19}/><div><strong>Awaiting verification</strong><p>{data.pendingEmail.newEmail}</p><small>Open the latest verification email before {new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.pendingEmail.expiresAt))} (Philippine time).</small><button type="button" onClick={cancelEmail} disabled={busy}>Cancel email change</button></div></div>}
      {token?<form onSubmit={verifyEmail}><div className="platform-form-intro"><h3>Confirm your new email</h3><p>You’re signed in as {user?.email}. Enter this account’s current password to complete verification.</p></div><fieldset disabled={busy}><PasswordField label="Current password" value={verifyPassword} onChange={setVerifyPassword}/></fieldset><Button type="submit" variant="accent" disabled={busy} icon={CheckCircle2}>{busy?'Verifying…':'Verify & change email'}</Button></form>:<form onSubmit={requestEmail}><fieldset disabled={busy||!data?.emailConfigured}><label className="platform-field"><span>New email address</span><input required type="email" autoComplete="email" maxLength={254} value={newEmail} onChange={event=>setNewEmail(event.target.value)} placeholder="Your new sign-in email"/></label><PasswordField label="Current password" value={emailPassword} onChange={setEmailPassword}/></fieldset>{!data?.emailConfigured&&<p className="platform-account-pending">Email delivery is not configured. Email changes will be available when the server’s email provider is set up.</p>}<Button type="submit" variant="accent" icon={Send} disabled={busy||!data?.emailConfigured}>{busy?'Sending…':data?.pendingEmail?'Send a replacement verification':'Send verification email'}</Button><p className="platform-inline-note"><ShieldCheck size={15}/>The link works once and expires in 30 minutes. Requesting another change disables the previous link.</p></form>}
    </>}
    {error&&<p role="alert" className="platform-error">{error}</p>}{message&&<p role="status" className="platform-account-success"><CheckCircle2 size={18}/>{message}</p>}
    </div><footer><ShieldCheck size={16}/><p>Successful changes sign out other sessions. Your current session stays active.</p></footer></section></div></main></div>;
}
