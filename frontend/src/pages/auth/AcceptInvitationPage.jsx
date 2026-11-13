import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,Building2,CheckCircle2,Eye,EyeOff,KeyRound,ShieldCheck} from 'lucide-react';
import {apiPost} from '../../services/api.js';
import Button from '../../components/ui/Button.jsx';
import '../superadmin/platform.css';

export default function AcceptInvitationPage() {
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')??'');
  const [invitation,setInvitation]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);const [accepted,setAccepted]=useState(false);const [signOutRequired,setSignOutRequired]=useState(false);
  useEffect(()=>{
    document.title='Accept institution invitation · DutyTrace';
    const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';document.head.append(meta);
    window.history.replaceState(window.history.state,'',window.location.pathname);
    let active=true;
    apiPost('/invitations/verify',{token}).then(value=>{if(active)setInvitation(value);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;meta.remove();};
  },[token]);
  async function accept(event) {
    event.preventDefault();setError('');
    if(password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);
    try{await apiPost('/invitations/accept',{token,password});setAccepted(true);setPassword('');setConfirm('');}
    catch(err){setError(err.message);setSignOutRequired(err.code==='SIGN_OUT_REQUIRED');}finally{setBusy(false);}
  }
  return <main className="platform-accept-shell"><Link className="platform-brand" to="/login"><span><ShieldCheck size={25}/></span><div>DutyTrace<small>INSTITUTION WORKSPACE</small></div></Link><section className="platform-accept-card"><span className="platform-icon violet">{accepted?<CheckCircle2 size={28}/>:<Building2 size={28}/>}</span><p className="platform-eyebrow">{accepted?'YOU’RE READY TO BEGIN':'YOUR SCHOOL’S WORKSPACE AWAITS'}</p><h1>{accepted?'Administrator account activated':'Welcome to DutyTrace'}</h1>{loading?<p role="status">Checking your invitation…</p>:accepted?<><p>Your institution administrator account is ready. Sign in with your invited email and the password you just created.</p><Link className="platform-login-link" to="/login">Continue to sign in<ArrowRight size={17}/></Link></>:invitation?<><div className="platform-institution-preview"><Building2 size={23}/><div><h2>{invitation.institutionName}</h2><p>{invitation.fullName} · {invitation.maskedEmail}</p></div></div><p>Set a password to accept your invitation as this institution’s administrator.</p><form onSubmit={accept}><fieldset disabled={busy}><label className="platform-field"><span>Create password</span><div className="platform-password"><input autoFocus required minLength={10} maxLength={200} type={show?'text':'password'} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><small>Use at least 10 characters.</small></label><label className="platform-field"><span>Confirm password</span><input required minLength={10} maxLength={200} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></fieldset>{error&&<p role="alert" className="platform-error">{error}</p>}{signOutRequired&&<Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await apiPost('/auth/logout',{});setSignOutRequired(false);setError('Signed out. You can now accept this invitation.');}catch(err){setError(err.message);}finally{setBusy(false);}}}>Sign out of current account</Button>}<Button type="submit" variant="accent" icon={KeyRound} disabled={busy}>{busy?'Activating…':'Activate administrator account'}</Button></form><p className="platform-inline-note"><ShieldCheck size={15}/>Your access is limited to this institution. You will not receive platform maintainer access.</p></>:<><p role="alert" className="platform-error">{error||'This invitation link is unavailable.'}</p><p>Ask the DutyTrace maintainer for a new invitation. Links expire after 48 hours and work once.</p><Link className="platform-login-link" to="/login">Back to sign in<ArrowRight size={17}/></Link></>}</section><p className="platform-accept-footer">DutyTrace · A dedicated workspace for every institution</p></main>;
}
