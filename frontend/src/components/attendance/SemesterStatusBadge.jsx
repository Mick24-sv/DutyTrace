import Badge from '../ui/Badge.jsx';
const STATUS={on_track:['On track','approved'],at_risk:['At risk','pending'],overdue:['Overdue','rejected'],
  completed:['Completed','approved'],insufficient_data:['Insufficient data','neutral'],not_configured:['Not configured','neutral']};
export default function SemesterStatusBadge({status}){
  const [label,tone]=STATUS[status]??STATUS.not_configured;
  return <Badge tone={tone}>{label}</Badge>;
}
