import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollText,
  Search,
  Filter,
  Calendar,
  ShieldAlert,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info,
  Clock,
  Layers,
  ArrowRight,
  UserCheck,
  Shield,
  Activity,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { apiGet } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'auth', label: 'Authentication' },
  { value: 'users', label: 'Users & Roles' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'dtr', label: 'Monthly DTR' },
  { value: 'absences', label: 'Absence Notices' },
  { value: 'cases', label: 'Compliance Cases' },
  { value: 'qr', label: 'QR Codes' },
  { value: 'institution', label: 'Institution' },
  { value: 'settings', label: 'Policies & Settings' },
];

const ROLES = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Administrator' },
  { value: 'supervisor', label: 'Office Supervisor' },
  { value: 'student', label: 'Student Assistant' },
  { value: 'system', label: 'System / Automated' },
];

const TARGET_TYPES = [
  { value: '', label: 'All Resources' },
  { value: 'user', label: 'User' },
  { value: 'office', label: 'Office' },
  { value: 'attendance_event', label: 'Attendance Event' },
  { value: 'monthly_dtr', label: 'Monthly DTR' },
  { value: 'absence_notice', label: 'Absence Notice' },
  { value: 'compliance_case', label: 'Compliance Case' },
  { value: 'institution', label: 'Institution' },
  { value: 'institution_dtr_policy', label: 'DTR Policy' },
  { value: 'student_duty_schedule', label: 'Duty Schedule' },
];

const CATEGORY_TONES = {
  auth: 'neutral',
  users: 'info',
  attendance: 'approved',
  dtr: 'pending',
  absences: 'rejected',
  cases: 'rejected',
  qr: 'info',
  institution: 'neutral',
  settings: 'info',
  other: 'neutral',
};

const ROLE_TONES = {
  admin: 'rejected',
  supervisor: 'info',
  student: 'approved',
  system: 'neutral',
};

export default function AuditTrailPage() {
  const { user } = useAuth();
  const timeZone = user?.institution?.timezone || 'Asia/Manila';

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [role, setRole] = useState('');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  // Data & State
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Expandable details
  const [expandedId, setExpandedId] = useState(null);

  // Fetch Stats
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await apiGet('/audit/stats');
      setStats(res);
    } catch {
      // stats failure shouldn't block the main table
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch Events
  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (role) params.set('role', role);
      if (targetType) params.set('targetType', targetType);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiGet(`/audit?${params.toString()}`);
      setEvents(res?.rows || []);
      setTotal(res?.total || 0);
    } catch (err) {
      setError(err?.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, category, role, targetType, dateFrom, dateTo]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setRole('');
    setTargetType('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Immutable, chronological record of system operations, authentication events, attendance, and administrative changes."
      >
        <Button
          variant="secondary"
          onClick={() => {
            loadStats();
            loadEvents();
          }}
          className="flex items-center gap-1.5"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </PageHeader>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Events Today"
          value={statsLoading ? '…' : (stats?.totalToday ?? 0)}
          hint="Recorded in institution scope"
          icon={ScrollText}
        />
        <StatCard
          label="Events This Month"
          value={statsLoading ? '…' : (stats?.totalMonth ?? 0)}
          hint="Total audit log entries"
          icon={Calendar}
        />
        <StatCard
          label="Auth Failures Today"
          value={statsLoading ? '…' : (stats?.authFailuresToday ?? 0)}
          hint="Failed logins & locked accounts"
          icon={ShieldAlert}
        />
        <StatCard
          label="Active Actors Today"
          value={statsLoading ? '…' : (stats?.uniqueActorsToday ?? 0)}
          hint="Unique users performing actions"
          icon={Users}
        />
      </div>

      {/* Filters Card */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy">
              <Filter className="h-4 w-4 text-teal" />
              <span>Filter Audit Records</span>
            </div>
            {(search || category || role || targetType || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-medium text-teal hover:underline focus:outline-none"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
            {/* Search Input */}
            <div className="min-w-0 xl:col-span-2">
              <label htmlFor="audit-search" className="mb-1 block text-xs font-medium text-muted">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                <input
                  id="audit-search"
                  type="text"
                  placeholder="Actor name, email, action, target..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="min-w-0">
              <label htmlFor="audit-category" className="mb-1 block text-xs font-medium text-muted">
                Category
              </label>
              <select
                id="audit-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className="min-w-0">
              <label htmlFor="audit-role" className="mb-1 block text-xs font-medium text-muted">
                Actor Role
              </label>
              <select
                id="audit-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Module / Resource Filter */}
            <div className="min-w-0">
              <label htmlFor="audit-resource" className="mb-1 block text-xs font-medium text-muted">
                Resource
              </label>
              <select
                id="audit-resource"
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range From/To */}
            <div className="min-w-0">
              <label htmlFor="audit-date-from" className="mb-1 block text-xs font-medium text-muted">From</label>
              <input id="audit-date-from" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink focus:border-teal focus:outline-none" />
            </div>
            <div className="min-w-0">
              <label htmlFor="audit-date-to" className="mb-1 block text-xs font-medium text-muted">To</label>
              <input id="audit-date-to" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-2 text-xs text-ink focus:border-teal focus:outline-none" />
            </div>
          </div>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card>
        {error ? (
          <div className="rounded-lg bg-bad-bg p-4 text-center text-sm text-bad-fg">
            <p className="font-medium">Failed to load audit trail</p>
            <p className="mt-1 text-xs">{error}</p>
            <Button
              variant="secondary"
              onClick={loadEvents}
              className="mt-3 text-xs"
            >
              Try Again
            </Button>
          </div>
        ) : loading && events.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-teal" />
            Loading audit records…
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events found"
          >
            No audit records match the current filters. Try selecting a broader date range or clearing filters.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                    <th scope="col" className="w-8 px-2 py-3" />
                    <th scope="col" className="px-3 py-3 font-semibold">Timestamp</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Actor / User</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Role</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Action</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Affected Resource</th>
                    <th scope="col" className="px-3 py-3 font-semibold">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {events.map((ev) => {
                    const isExpanded = expandedId === ev.id;
                    const roleTone = ROLE_TONES[ev.actor?.role] || 'neutral';
                    const catTone = CATEGORY_TONES[ev.category] || 'neutral';

                    return (
                      <EventRow
                        key={ev.id}
                        event={ev}
                        timeZone={timeZone}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(ev.id)}
                        roleTone={roleTone}
                        catTone={catTone}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-4 sm:flex-row">
              <p className="text-xs text-muted">
                Showing{' '}
                <span className="font-semibold text-ink">
                  {total > 0 ? (page - 1) * limit + 1 : 0}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-ink">
                  {Math.min(page * limit, total)}
                </span>{' '}
                of <span className="font-semibold text-ink">{total}</span> records
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-1.5 text-xs"
                >
                  Previous
                </Button>
                <span className="px-2 text-xs font-medium text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  className="px-3 py-1.5 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function EventRow({ event, timeZone, isExpanded, onToggle, roleTone, catTone }) {
  const hasDetails = Boolean(event.beforeData || event.afterData || event.targetId);

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-canvas/60 ${
          isExpanded ? 'bg-canvas/40' : ''
        }`}
      >
        <td className="px-2 py-3 text-center text-muted">
          {hasDetails ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-teal" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted" />
            )
          ) : (
            <span className="inline-block w-4" />
          )}
        </td>

        <td className="whitespace-nowrap px-3 py-3 text-xs text-ink font-mono">
          {formatDateTime(event.createdAt, timeZone)}
        </td>

        <td className="px-3 py-3">
          {event.actor ? (
            <div>
              <p className="font-medium text-ink">{event.actor.name}</p>
              <p className="text-xs text-muted">{event.actor.email}</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted">
              <Shield className="h-3.5 w-3.5" />
              <span className="text-xs italic">System / Anonymous</span>
            </div>
          )}
        </td>

        <td className="whitespace-nowrap px-3 py-3">
          <Badge tone={roleTone}>
            {event.actor?.role ? formatRole(event.actor.role) : 'System'}
          </Badge>
        </td>

        <td className="px-3 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-ink">{event.label}</span>
              <Badge tone={catTone}>{event.category}</Badge>
            </div>
            <code className="text-[11px] text-muted">{event.action}</code>
          </div>
        </td>

        <td className="px-3 py-3">
          {event.targetType ? (
            <div>
              <span className="inline-block rounded bg-line/60 px-1.5 py-0.5 text-xs font-mono text-ink">
                {event.targetType}
              </span>
              {event.targetId && (
                <p className="mt-0.5 truncate max-w-[140px] text-[11px] font-mono text-muted" title={event.targetId}>
                  #{event.targetId}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </td>

        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">
          {event.ipAddress || '—'}
        </td>
      </tr>

      {/* Expanded Row Detail */}
      {isExpanded && (
        <tr className="bg-canvas/40 border-b border-line">
          <td colSpan={7} className="px-6 py-4">
            <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-navy">
                  <Activity className="h-4 w-4 text-teal" />
                  <span>Audit Event #{event.id} Metadata</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>Action: <strong className="text-ink">{event.action}</strong></span>
                  <span>IP: <strong className="text-ink">{event.ipAddress || 'Not recorded'}</strong></span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Before Data */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted uppercase">
                    Previous State (Before)
                  </p>
                  {event.beforeData ? (
                    <pre className="max-h-60 overflow-auto rounded bg-canvas p-3 text-xs font-mono text-ink border border-line">
                      {JSON.stringify(event.beforeData, null, 2)}
                    </pre>
                  ) : (
                    <div className="rounded border border-dashed border-line bg-canvas/50 p-3 text-center text-xs text-muted">
                      No previous state (new record or non-mutating event)
                    </div>
                  )}
                </div>

                {/* After Data */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-teal uppercase">
                    New State / Result (After)
                  </p>
                  {event.afterData ? (
                    <pre className="max-h-60 overflow-auto rounded bg-canvas p-3 text-xs font-mono text-ink border border-teal/30">
                      {JSON.stringify(event.afterData, null, 2)}
                    </pre>
                  ) : (
                    <div className="rounded border border-dashed border-line bg-canvas/50 p-3 text-center text-xs text-muted">
                      No state payload recorded
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function formatRole(role) {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'supervisor':
      return 'Supervisor';
    case 'student':
      return 'Student Assistant';
    default:
      return role;
  }
}

