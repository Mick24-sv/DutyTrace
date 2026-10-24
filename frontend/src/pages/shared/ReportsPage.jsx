import { useState, useEffect, useRef } from 'react';
import {
  Download,
  Filter,
  Calendar,
  Building2,
  Clock,
  FileText,
  AlertCircle,
  FolderCheck,
  CalendarOff,
  CheckCircle2,
  Hourglass,
  TrendingDown,
  RefreshCw,
  CalendarRange,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiGet, apiUrl } from '../../services/api.js';
import { formatHours, formatTime } from '../../utils/format.js';

const REPORT_TABS = [
  { id: 'attendance', label: 'Attendance Sessions', icon: Clock },
  { id: 'hours', label: 'Recorded vs. Verified Hours', icon: Hourglass },
  { id: 'semester-hours', label: 'Semester Duty-Hour Progress', icon: CalendarRange },
  { id: 'dtr', label: 'Monthly DTR Status', icon: FileText },
  { id: 'outstanding', label: 'Outstanding Requirements', icon: TrendingDown },
  { id: 'absences', label: 'Absence Notifications', icon: CalendarOff },
  { id: 'cases', label: 'Compliance Cases', icon: FolderCheck },
];

const statusLabel = (value) => (typeof value === 'string' && value.trim()
  ? value.replace(/_/g, ' ')
  : 'Unknown');

export default function ReportsPage() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'supervisor';
  const defaultOfficeId = isSupervisor ? user?.office?.id : '';

  // Active Report Tab
  const [activeTab, setActiveTab] = useState('attendance');

  // Filter States
  const [officeId, setOfficeId] = useState(defaultOfficeId || '');
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [termId, setTermId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 7;

  // Offce list for admin filter dropdown
  const officesQuery = useApiData(user?.role === 'admin' ? '/offices' : null);
  const officesList = officesQuery.data?.offices ?? [];
  const semesterList = useApiData(user?.role === 'admin' ? '/semesters' : null);
  const currentTermQuery = useApiData('/semesters/current');
  const availableTerms = user?.role === 'admin'
    ? (semesterList.data?.terms ?? [])
    : (currentTermQuery.data?.term ? [currentTermQuery.data.term] : []);

  useEffect(() => {
    if (!termId && currentTermQuery.data?.term?.id) setTermId(currentTermQuery.data.term.id);
  }, [termId, currentTermQuery.data]);

  // Report Data State
  const [reportData, setReportData] = useState(null);
  const reportRequestId = useRef(0);
  const currentReportData = reportData?.tab === activeTab ? reportData.data : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load report data when filters or active tab change
  const fetchReport = async () => {
    const requestId = ++reportRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('format', 'json');

      if (officeId) params.set('officeId', officeId);
      if (month) params.set('month', month);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      if (activeTab === 'semester-hours' && termId) params.set('termId', termId);

      let endpoint = `/reports/${activeTab}`;
      if (activeTab === 'outstanding') endpoint = '/reports/outstanding-requirements';
      if (activeTab === 'semester-hours') endpoint = '/reports/semester-hours';

      const data = await apiGet(`${endpoint}?${params.toString()}`);
      if (requestId === reportRequestId.current) {
        if (page > Math.max(1, data.pagination?.totalPages ?? 1)) {
          setPage(Math.max(1, data.pagination?.totalPages ?? 1));
          return;
        }
        setReportData({ tab: activeTab, data });
      }
    } catch (err) {
      if (requestId === reportRequestId.current) {
        setError(err.message || 'Failed to generate report.');
      }
    } finally {
      if (requestId === reportRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [activeTab, officeId, month, from, to, status, termId]);

  useEffect(() => {
    fetchReport();
  }, [activeTab, officeId, month, from, to, status, termId, page]);

  // Generate CSV download URL
  const getCsvExportUrl = () => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (officeId) params.set('officeId', officeId);
    if (month) params.set('month', month);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    if (activeTab === 'semester-hours' && termId) params.set('termId', termId);

    let endpoint = `/reports/${activeTab}`;
    if (activeTab === 'outstanding') endpoint = '/reports/outstanding-requirements';
    if (activeTab === 'semester-hours') endpoint = '/reports/semester-hours';
    return apiUrl(`${endpoint}?${params.toString()}`);
  };

  const clearFilters = () => {
    if (!isSupervisor) setOfficeId('');
    setSearch('');
    setMonth('');
    setFrom('');
    setTo('');
    setStatus('');
    setTermId(currentTermQuery.data?.term?.id ?? '');
    setPage(1);
  };

  // Define Columns by Report Type
  const renderColumns = () => {
    switch (activeTab) {
      case 'semester-hours':
        return [
          { key: 'fullName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Assigned Office' },
          { key: 'requiredHours', header: 'Required', render: (r) => r.requirementAssigned ? `${formatHours(r.requiredHours)} h` : 'No requirement assigned' },
          { key: 'recordedHours', header: 'Recorded', render: (r) => formatHours(r.recordedHours) },
          { key: 'verifiedHours', header: 'Verified', render: (r) => formatHours(r.verifiedHours) },
          { key: 'remainingHours', header: 'Remaining', render: (r) => r.requirementAssigned ? formatHours(r.remainingHours) : '—' },
          { key: 'completionPercentage', header: 'Complete', render: (r) => r.requirementAssigned ? `${r.completionPercentage}%` : '—' },
          { key: 'completionDeadline', header: 'Deadline', render: (r) => r.completionDeadline ?? '—' },
        ];
      case 'attendance':
        return [
          { key: 'date', header: 'Date' },
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          {
            key: 'timeIn',
            header: 'Time In',
            render: (r) => formatTime(r.timeIn),
          },
          {
            key: 'timeOut',
            header: 'Time Out',
            render: (r) => formatTime(r.timeOut),
          },
          {
            key: 'recordedHours',
            header: 'Hours',
            render: (r) => <span className="font-mono font-medium">{formatHours(r.recordedHours)}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const status = typeof r.status === 'string' ? r.status : 'unknown';
              const tone = status === 'unknown'
                ? 'neutral'
                : r.counted
                  ? 'approved'
                  : status === 'in_progress'
                    ? 'pending'
                    : 'rejected';
              return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>;
            },
          },
        ];

      case 'hours':
        return [
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          { key: 'month', header: 'Month' },
          {
            key: 'requiredHours',
            header: 'Required',
            render: (r) => `${r.requiredHours} h`,
          },
          {
            key: 'recordedHours',
            header: 'Recorded',
            render: (r) => <span className="font-mono">{formatHours(r.recordedHours)}</span>,
          },
          {
            key: 'verifiedHours',
            header: 'Verified',
            render: (r) => <span className="font-mono text-ok-fg font-semibold">{formatHours(r.verifiedHours)}</span>,
          },
          {
            key: 'remainingHours',
            header: 'Shortfall',
            render: (r) => (
              <span className={`font-mono ${r.remainingHours > 0 ? 'text-bad-fg font-medium' : 'text-muted'}`}>
                {r.remainingHours > 0 ? `-${formatHours(r.remainingHours)}` : '0.00 h'}
              </span>
            ),
          },
          {
            key: 'dtrStatus',
            header: 'DTR Status',
            render: (r) => (
              <Badge tone={r.dtrStatus === 'approved' ? 'approved' : r.dtrStatus === 'none' ? 'neutral' : 'pending'}>
                {r.dtrStatus}
              </Badge>
            ),
          },
        ];

      case 'dtr':
        return [
          { key: 'month', header: 'Month' },
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          {
            key: 'status',
            header: 'Review Status',
            render: (r) => {
              const status = typeof r.status === 'string' ? r.status : 'unknown';
              const tone = status === 'unknown'
                ? 'neutral'
                : status === 'approved' || status === 'historical_credit'
                  ? 'approved'
                  : status === 'needs_correction'
                    ? 'rejected'
                    : 'pending';
              return (
                <Badge tone={tone}>
                  {status === 'historical_credit' ? 'Historical verified' : status.replace(/_/g, ' ')}
                </Badge>
              );
            },
          },
          { key: 'currentRevision', header: 'Rev', render: (r) => r.currentRevision ? `v${r.currentRevision}` : '—' },
          {
            key: 'recordedHours',
            header: 'Recorded',
            render: (r) => <span className="font-mono">{formatHours(r.recordedHours)}</span>,
          },
          {
            key: 'verifiedHours',
            header: 'Verified',
            render: (r) => <span className="font-mono font-semibold text-ok-fg">{formatHours(r.verifiedHours)}</span>,
          },
          {
            key: 'historicalHours',
            header: 'Historical',
            render: (r) => <span className="font-mono text-teal">{formatHours(r.historicalHours)}</span>,
          },
          { key: 'decidedBy', header: 'Reviewer' },
        ];

      case 'outstanding':
        return [
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          { key: 'month', header: 'Month' },
          {
            key: 'requiredHours',
            header: 'Target Hours',
            render: (r) => `${r.requiredHours} h`,
          },
          {
            key: 'recordedHours',
            header: 'Recorded',
            render: (r) => <span className="font-mono">{formatHours(r.recordedHours)}</span>,
          },
          {
            key: 'remainingHours',
            header: 'Hours Behind / Deficit',
            render: (r) => (
              <span className="font-mono font-bold text-bad-fg">
                -{formatHours(r.remainingHours)}
              </span>
            ),
          },
          {
            key: 'dtrStatus',
            header: 'DTR Status',
            render: (r) => (
              <Badge tone={r.dtrStatus === 'approved' ? 'approved' : r.dtrStatus === 'none' ? 'neutral' : 'pending'}>
                {r.dtrStatus}
              </Badge>
            ),
          },
        ];

      case 'absences':
        return [
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          {
            key: 'absenceType',
            header: 'Type',
            render: (r) => (
              <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-canvas">
                {r.absenceType}
              </span>
            ),
          },
          { key: 'startDate', header: 'Start Date' },
          { key: 'endDate', header: 'End Date' },
          {
            key: 'reason',
            header: 'Reason',
            render: (r) => <span className="truncate max-w-xs block" title={r.reason}>{r.reason}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const status = typeof r.status === 'string' ? r.status : 'unknown';
              const tone = status === 'reviewed' ? 'approved' : status === 'needs_follow_up' ? 'rejected' : 'pending';
              return <Badge tone={tone}>{statusLabel(status)}</Badge>;
            },
          },
          { key: 'documentCount', header: 'Docs', render: (r) => `${r.documentCount} file(s)` },
        ];

      case 'cases':
        return [
          { key: 'reference', header: 'Reference' },
          { key: 'studentName', header: 'Student Assistant' },
          { key: 'officeName', header: 'Office' },
          { key: 'caseTypeName', header: 'Case Type' },
          {
            key: 'period',
            header: 'Period',
            render: (r) => `${r.periodStart} to ${r.periodEnd}`,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const status = typeof r.status === 'string' ? r.status : 'unknown';
              const tone = status === 'resolved' ? 'approved' : status === 'closed' ? 'neutral' : 'pending';
              return <Badge tone={tone}>{statusLabel(status)}</Badge>;
            },
          },
          { key: 'missingRequirements', header: 'Missing Reqs', render: (r) => r.missingRequirements },
          {
            key: 'decision',
            header: 'Decision',
            render: (r) => <span className="truncate max-w-xs block" title={r.decision}>{r.decision}</span>,
          },
        ];

      default:
        return [];
    }
  };

  // Render High-Level KPI Summary banner above table
  const renderSummaryCards = () => {
    const s = currentReportData?.summary;
    if (!s) return null;

    switch (activeTab) {
      case 'semester-hours':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Academic Term</div>
              <div className="text-lg font-bold text-navy mt-1">
                {currentReportData?.term ? `${currentReportData.term.academicYear} · ${currentReportData.term.semester}` : 'No active term'}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Recorded Hours</div>
              <div className="text-lg font-bold text-teal mt-1">{formatHours(s.totalRecordedHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Verified Hours</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{formatHours(s.totalVerifiedHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Students Below Requirement</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.studentsBelowRequirement}</div>
            </div>
          </div>
        );
      case 'attendance':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Sessions</div>
              <div className="text-lg font-bold text-navy mt-1">{s.totalSessions}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Recorded Hours</div>
              <div className="text-lg font-bold text-teal mt-1">{formatHours(s.recordedHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Counted Sessions</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{s.countedSessions}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Incomplete Sessions</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.incompleteCount}</div>
            </div>
          </div>
        );

      case 'hours':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Students</div>
              <div className="text-lg font-bold text-navy mt-1">{s.totalStudents}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Recorded</div>
              <div className="text-lg font-bold text-teal mt-1">{formatHours(s.totalRecordedHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Verified</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{formatHours(s.totalVerifiedHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Students Below Target</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.studentsBelowRequirement}</div>
            </div>
          </div>
        );

      case 'dtr':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total DTRs</div>
              <div className="text-lg font-bold text-navy mt-1">{s.total}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Pending Review</div>
              <div className="text-lg font-bold text-warn-fg mt-1">{s.pendingReview}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Approved & Verified</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{s.approved}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Months with Historical Credits</div>
              <div className="text-lg font-bold text-teal mt-1">{s.historicalCreditMonths ?? 0}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Returned for Correction</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.needs_correction}</div>
            </div>
          </div>
        );

      case 'outstanding':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Students with Deficit</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.totalStudentsBelow}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Shortfall Hours</div>
              <div className="text-lg font-bold text-navy mt-1">-{formatHours(s.totalShortfallHours)}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Required Monthly Target</div>
              <div className="text-lg font-bold text-teal mt-1">{s.requiredMonthlyHours} h/mo</div>
            </div>
          </div>
        );

      case 'absences':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Notices</div>
              <div className="text-lg font-bold text-navy mt-1">{s.total}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Pending Review</div>
              <div className="text-lg font-bold text-warn-fg mt-1">{s.pending}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Requires Follow-up</div>
              <div className="text-lg font-bold text-bad-fg mt-1">{s.needs_follow_up}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Reviewed / Completed</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{s.reviewed}</div>
            </div>
          </div>
        );

      case 'cases':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Total Cases</div>
              <div className="text-lg font-bold text-navy mt-1">{s.total}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Active Cases</div>
              <div className="text-lg font-bold text-warn-fg mt-1">{s.activeCases}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Resolved</div>
              <div className="text-lg font-bold text-ok-fg mt-1">{s.resolved}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs text-muted">Closed</div>
              <div className="text-lg font-bold text-muted mt-1">{s.closed}</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const items = currentReportData?.items ?? [];
  const reportColumns = renderColumns();
  const filteredItems = items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.trim().toLowerCase()));
  const pagination = currentReportData?.pagination ?? { page: 1, limit, total: items.length, totalPages: 1 };

  return (
    <>
      <PageHeader
        title="Institutional Reports & Exports"
        description="Search, filter, analyze, and export duty hours, attendance records, monthly DTRs, and compliance records."
      >
        <a
          href={getCsvExportUrl()}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal/90 transition"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </PageHeader>

      {/* Report Switcher Tabs */}
      <div className="mb-6 border-b border-line">
        <nav className="flex space-x-2 overflow-x-auto pb-2" aria-label="Reports">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  clearFilters();
                }}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-teal text-white shadow-sm'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Practical Filters Bar */}
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-navy uppercase tracking-wider">
          <Filter className="h-3.5 w-3.5" />
          Report Filters
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Office selector */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Office</label>
            {isSupervisor ? (
              <input
                type="text"
                disabled
                value={user?.office?.name || 'Your Office'}
                className="w-full rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-muted cursor-not-allowed"
              />
            ) : (
              <select
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
              >
                <option value="">All Offices</option>
                {officesList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            )}

            {activeTab === 'semester-hours' && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Academic term</label>
                <select
                  value={termId}
                  onChange={(event) => setTermId(event.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
                >
                  <option value="">Current term</option>
                  {availableTerms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.academicYear} · {term.semester}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Month selector for month-based reports */}
          {(activeTab === 'hours' || activeTab === 'dtr' || activeTab === 'outstanding' || activeTab === 'attendance') && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Month (YYYY-MM)</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
              />
            </div>
          )}

          {/* Date range from/to for attendance, absences, cases */}
          {(activeTab === 'attendance' || activeTab === 'absences' || activeTab === 'cases') && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">From Date</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">To Date</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Status selector customized by tab */}
          {activeTab === 'dtr' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">DTR Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="needs_correction">Returned for Correction</option>
              </select>
            </div>
          )}

          {activeTab === 'absences' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Absence Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="reviewed">Reviewed</option>
                <option value="needs_follow_up">Needs Follow-Up</option>
              </select>
            </div>
          )}

          {activeTab === 'cases' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Case Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-teal focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="documents_pending">Documents Pending</option>
                <option value="under_review">Under Review</option>
                <option value="needs_correction">Needs Correction</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-canvas transition"
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={fetchReport}
            className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90 transition"
          >
            <RefreshCw className="h-3 w-3" />
            Apply / Refresh
          </button>
        </div>
      </Card>

      {error && (
        <div role="alert" className="mb-6 rounded-lg bg-bad-bg p-4 text-sm text-bad-fg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Report Query Error</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Summary KPI Banner */}
      {!loading && renderSummaryCards()}

      {/* Report Table Card */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-line">
          <h2 className="text-base font-semibold text-navy">
            {REPORT_TABS.find((t) => t.id === activeTab)?.label}
          </h2>
          <span className="text-xs text-muted">
            {pagination.total} total record{pagination.total === 1 ? '' : 's'} found
          </span>
        </div>
        <label htmlFor="report-search" className="sr-only">Search records on this page</label>
        <div className="relative mb-3 w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input id="report-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this page" className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted" />
        </div>
        <div className="hidden sm:block">
          <DataTable
            columns={reportColumns}
            rows={filteredItems}
            caption="Report data results table"
            empty={loading ? 'Querying database...' : 'No records match the selected filter criteria.'}
          />
        </div>
        <div className="divide-y divide-line sm:hidden">
          {filteredItems.length === 0 ? <p className="py-5 text-center text-sm text-muted">{loading ? 'Querying database...' : 'No records match the selected filter criteria.'}</p> : filteredItems.map((item, index) => {
            const visibleColumns = reportColumns.filter((column) => column.header);
            const first = visibleColumns[0];
            const second = visibleColumns[1];
            const renderValue = (column) => column.render ? column.render(item) : item[column.key];
            return (
              <article key={`${page}-${index}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  {first && <p className="break-words text-sm font-medium text-ink">{renderValue(first)}</p>}
                  {second && <p className="break-words text-xs text-muted">{renderValue(second)}</p>}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  {visibleColumns.slice(2).map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-muted">{column.header}</dt>
                      <dd className="mt-0.5 break-words text-ink">{renderValue(column)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>

        {!error && currentReportData && (
          <nav aria-label="Report pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p role="status" className="w-full text-center text-xs text-muted sm:w-auto sm:text-left">
              Records {pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              <span className="ml-2">Page {pagination.page} of {pagination.totalPages}</span>
            </p>
            <div className="flex w-full justify-between gap-2 sm:w-auto">
              <button type="button" disabled={pagination.page <= 1 || loading}
                onClick={() => setPage(Math.max(1, pagination.page - 1))}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </button>
              <button type="button" disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage(Math.min(pagination.totalPages, pagination.page + 1))}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-teal hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-40">
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </Card>
    </>
  );
}
