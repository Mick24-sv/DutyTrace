import { Link } from 'react-router-dom';
import DataTable from '../ui/DataTable.jsx';
import Badge from '../ui/Badge.jsx';
import DtrStatusBadge from './DtrStatusBadge.jsx';
import { formatHours, formatMonth } from '../../utils/format.js';

// Shared by supervisor (queue) and admin (overview). `linkLabel` e.g. "Review" / "View".
export default function DtrListTable({ dtrs, linkLabel, showOffice = false }) {
  const columns = [
    { key: 'student', header: 'Student Assistant', render: (d) => (<><span className="font-medium">{d.student.fullName}</span><span className="block text-xs text-muted">{d.student.email}</span></>) },
    ...(showOffice ? [{ key: 'office', header: 'Office', render: (d) => d.office.name }] : []),
    { key: 'month', header: 'Month', render: (d) => formatMonth(d.month) },
    { key: 'status', header: 'Status', render: (d) => <DtrStatusBadge status={d.status} /> },
    { key: 'recorded', header: 'Recorded', render: (d) => formatHours(d.recordedHours) },
    { key: 'verified', header: 'Verified', render: (d) => (d.verifiedHours != null ? formatHours(d.verifiedHours) : <span className="text-muted">Not verified</span>) },
    { key: 'flags', header: 'Flagged', render: (d) => (d.incompleteCount > 0 ? <Badge tone="rejected">{d.incompleteCount} flagged</Badge> : <span className="text-muted">None</span>) },
    { key: 'open', header: '', render: (d) => <Link to={d.id} className="font-medium text-teal underline">{linkLabel}</Link> },
  ];
  return <DataTable columns={columns} rows={dtrs} caption="Monthly DTRs" empty="No DTRs match this filter." />;
}
