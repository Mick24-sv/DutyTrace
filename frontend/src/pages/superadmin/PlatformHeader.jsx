import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Settings,ShieldCheck} from 'lucide-react';
import {useAuth} from '../../hooks/useAuth.jsx';
import ProblemReportAlert from '../../components/support/ProblemReportAlert.jsx';
import AccountMenuActions from '../../components/layout/AccountMenuActions.jsx';

export default function PlatformHeader() {
 const {user,logout}=useAuth();const navigate=useNavigate();const [open,setOpen]=useState(false);const wrap=useRef(null);const trigger=useRef(null);
 useEffect(()=>{if(!open)return;const outside=event=>{if(!wrap.current?.contains(event.target))setOpen(false);};const escape=event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
 async function signOut(){setOpen(false);try{await logout();}finally{navigate('/login',{replace:true});}}
 return <header className="platform-topbar"><Link className="platform-brand" to="/superadmin"><span><ShieldCheck size={25} aria-hidden="true"/></span><div>DutyTrace<small>PLATFORM WORKSPACE</small></div></Link><div className="platform-maintainer"><ProblemReportAlert compact/><span className="platform-maintainer-label"><ShieldCheck size={13} aria-hidden="true"/>Superadmin</span><div className="platform-account-wrap" ref={wrap}><button ref={trigger} type="button" className="platform-account-link platform-account-trigger" aria-label="Account menu" title="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Settings size={18} aria-hidden="true"/><span className="platform-maintainer-name">{user?.fullName}</span></button>{open&&<div className="platform-account-dropdown" role="menu" aria-label="Your account"><header><strong>{user?.fullName}</strong><span>{user?.email}</span></header><AccountMenuActions role="superadmin" onClose={()=>setOpen(false)} onSignOut={signOut}/></div>}</div></div></header>;
}
