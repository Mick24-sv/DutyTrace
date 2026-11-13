import {Link} from 'react-router-dom';
import {Bug,LogOut,Palette,Settings,UserRound} from 'lucide-react';
import './account-menu-actions.css';

export default function AccountMenuActions({role,onClose,onReport,onSignOut}){
 const platform=role==='superadmin';const ProfileIcon=platform?Settings:UserRound;
 return <div className="account-menu-actions"><div className="account-menu-settings">
  <Link className="account-menu-action" role="menuitem" to={platform?'/superadmin/account':`/${role}/profile`} onClick={onClose}><ProfileIcon aria-hidden="true"/>{platform?'Account settings':role==='admin'?'Profile settings':'Edit my profile'}</Link>
  <Link className="account-menu-action" role="menuitem" to={`/${role}/appearance`} onClick={onClose}><Palette aria-hidden="true"/>Appearance</Link>
  {platform?<Link className="account-menu-action" role="menuitem" to="/superadmin/problem-reports" onClick={onClose}><Bug aria-hidden="true"/>Problem reports</Link>:<button className="account-menu-action" type="button" role="menuitem" onClick={onReport}><Bug aria-hidden="true"/>Report a problem</button>}
 </div><div className="account-menu-signout"><button className="account-menu-action account-menu-danger" type="button" role="menuitem" onClick={onSignOut}><LogOut aria-hidden="true"/>Sign out</button></div></div>;
}
