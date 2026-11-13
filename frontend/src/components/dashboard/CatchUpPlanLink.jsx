import { Link } from 'react-router-dom';
import { Route } from 'lucide-react';
import './catch-up.css';

export default function CatchUpPlanLink({role,studentId,termId,status}) {
  if(status!=='at_risk'||!studentId||!termId) return null;
  return <Link className="catch-up-link" to={`/${role}/catch-up/${termId}/${studentId}`}><Route size={14} aria-hidden="true" />{role==='student'?'Plan catch-up hours':role==='supervisor'?'Review catch-up plan':'View catch-up plan'}</Link>;
}
