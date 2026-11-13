import {Link} from 'react-router-dom';
import {Bug,ArrowUpRight} from 'lucide-react';
import useProblemSummary from './useProblemSummary.js';
import './problem-reports.css';
export default function ProblemReportAlert({compact=false}){
 const {data,error}=useProblemSummary();
 if(compact)return <Link className="problem-header-link" to="/superadmin/problem-reports" aria-label={error?'Problem reports, count unavailable':`Problem reports, ${data?.new??0} new reports`} title={error?'Unable to check new reports':'Problem reports'}><Bug size={19}/><span>Reports</span>{data?.new>0&&<b>{data.new>99?'99+':data.new}</b>}{error&&<b>!</b>}</Link>;
 return <section className="problem-dashboard-alert"><span className="problem-icon"><Bug size={23}/></span><div><h2>Problem reports</h2><p role="status">{error?'Unable to check report totals. Open the inbox to retry.':data?`${data.new} new · ${data.investigating} investigating · ${data.resolved} resolved`:'Checking problem reports…'}</p></div><Link to="/superadmin/problem-reports">Open report inbox<ArrowUpRight size={15}/></Link></section>;
}
