import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Pagination from '../ui/Pagination.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatHours, formatMonth } from '../../utils/format.js';

const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:text-sm';
const PAGE_SIZE = 7;
const monthDates = (month) => ({ start: `${month}-01`, end: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) });

export default function HistoricalDutyHoursPanel({ initialStudentId = '', onSaved }) {
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const optionsQuery = useApiData('/historical-duty-hours/options');
  const listQuery = useApiData(`/historical-duty-hours/mine?refresh=${refresh}`);
  const terms = optionsQuery.data?.terms ?? [];
  const [termId, setTermId] = useState('');
  const [studentId, setStudentId] = useState(initialStudentId);
  const [month, setMonth] = useState('');
  const [granularity, setGranularity] = useState('monthly_total');
  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('');
  const [verificationSource, setVerificationSource] = useState('');
  const [verificationReference, setVerificationReference] = useState('');
  const [reason, setReason] = useState('');
  const [exceptional, setExceptional] = useState(false);
  const [amendsId, setAmendsId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const term = terms.find((item) => item.id === termId) ?? terms[0];
  const students = term?.students ?? [];
  const selectedMonth = term?.months.find((item) => item.month === month);
  const eligibility = useApiData(studentId && termId && month && !amendsId
    ? `/historical-duty-hours/eligibility?studentId=${studentId}&termId=${termId}&month=${month}&refresh=${refresh}` : null);
  const monthlyAllowed = selectedMonth?.allowsMonthlyTotal && (amendsId || eligibility.data?.monthlyAllowed);
  const periodReady = Boolean(amendsId || (!eligibility.loading && !eligibility.error && eligibility.data &&
    (granularity === 'monthly_total' ? eligibility.data.monthlyAllowed : eligibility.data.availableDates.includes(workDate))));
  useEffect(() => {
    if(amendsId || !eligibility.data) return;
    if(!eligibility.data.monthlyAllowed && granularity==='monthly_total') {
      setGranularity('daily'); setWorkDate(''); setHours('');
    }
  }, [eligibility.data, amendsId, granularity]);
  const dateBounds = month ? monthDates(month) : null;
  const entries = (listQuery.data?.items ?? []).filter(item => item.studentId === studentId && item.termId === term?.id);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(entries.length / PAGE_SIZE)));
  const visibleEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!terms.length) return;
    if (!terms.some((item) => item.id === termId)) setTermId((terms.find(item => item.students.some(student => student.id === initialStudentId)) ?? terms[0]).id);
  }, [terms, termId, initialStudentId]);

  useEffect(() => {
    if (!term || term.id !== termId) return;
    if (!students.some((student) => student.id === studentId)) setStudentId(students[0]?.id ?? '');
    if (!term.months.some((item) => item.month === month)) {
      const latest = term.months.at(-1);
      setMonth(latest?.month ?? '');
      setGranularity(latest?.allowsMonthlyTotal ? 'monthly_total' : 'daily');
      setWorkDate('');
    }
  }, [termId, terms]);

  const availableDates = useMemo(() => {
    if (!dateBounds || !term) return { min: '', max: '' };
    return { min: dateBounds.start < term.startsOn ? term.startsOn : dateBounds.start, max: dateBounds.end > term.endsOn ? term.endsOn : dateBounds.end };
  }, [term, month]);

  function startAmendment(item) {
    setAmendsId(item.id); setTermId(item.termId); setStudentId(item.studentId); setMonth(item.month);
    setGranularity(item.granularity); setWorkDate(item.workDate ?? ''); setHours(String(item.hours));
    setVerificationSource(item.verificationSource); setVerificationReference(item.verificationReference);
    setReason(''); setExceptional(true); setMessage('Amendments require administrator approval. The current approved credit remains active until the amendment is approved.');
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if(!periodReady) { setError('Choose an eligible period before recording hours.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const {item} = await apiPost('/historical-duty-hours', { studentId, termId, month, granularity,
        workDate: granularity === 'daily' ? workDate : null, hours: Number(hours), verificationSource,
        verificationReference, reason, exceptional, ...(amendsId ? { amendsId } : {}) });
      setMessage(item.status === 'approved' ? 'Historical credit verified and added to the student’s semester hours.' : 'Submitted for administrator review before it affects verified totals.');
      setHours(''); setVerificationSource(''); setVerificationReference(''); setReason(''); setExceptional(false); setAmendsId('');
      setRefresh((value) => value + 1);
      setPage(1);
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Historical duty hours" className="mt-6" action={<Badge tone="info">Supervisor verification</Badge>}>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">Use this for previous-month hours supported by paper DTRs or official records. To fix a QR clock-in or clock-out, use the student's attendance history.</p>
      {optionsQuery.loading && <p role="status" className="text-sm text-muted">Loading assigned terms and students…</p>}
      {optionsQuery.error && <p role="alert" className="text-sm text-bad-fg">Unable to load historical credit options: {optionsQuery.error}</p>}
      {!optionsQuery.loading && !optionsQuery.error && terms.length === 0 && <p className="text-sm text-muted">No active academic term and assigned students are available for historical credits.</p>}
      {term && <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="min-w-0 space-y-3 disabled:opacity-60">
        <legend className="mb-3 text-sm font-semibold text-navy">1. Choose the student and period</legend>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-muted">Academic year and semester<select required className={field} value={termId} onChange={(event) => { setTermId(event.target.value); setAmendsId(''); }}>
            {terms.map((item) => <option key={item.id} value={item.id}>{item.academicYear} · {item.semester} semester</option>)}
          </select></label>
          <label className="text-xs font-medium text-muted">Student Assistant<select required className={field} value={studentId} onChange={(event) => { setStudentId(event.target.value); setAmendsId(''); setPage(1); }}>
            {students.map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}
          </select></label>
          <label className="text-xs font-medium text-muted">Previous month<select required className={field} value={month} onChange={(event) => { const value = event.target.value; setMonth(value); setGranularity(term.months.find((item) => item.month === value)?.allowsMonthlyTotal ? 'monthly_total' : 'daily'); setWorkDate(''); setAmendsId(''); }}>
            {term.months.map((item) => <option key={item.month} value={item.month}>{formatMonth(item.month)}</option>)}
          </select></label>
          <label className="text-xs font-medium text-muted">Entry type<select required className={field} value={granularity} onChange={(event) => { setGranularity(event.target.value); setWorkDate(''); setAmendsId(''); }}>
            {monthlyAllowed && <option value="monthly_total">Monthly total</option>}
            <option value="daily">Date-level entry</option>
          </select></label>
        </div>
        </fieldset>
        {!amendsId && eligibility.loading && <p role="status" className="text-sm text-muted">Checking existing attendance and historical credits…</p>}
        {!amendsId && eligibility.error && <p role="alert" className="text-sm text-bad-fg">Unable to check this period: {eligibility.error}</p>}
        {!amendsId && eligibility.data && !eligibility.data.monthlyAllowed && <div className="rounded-lg bg-info-bg p-3 text-sm text-info-fg">
          <p className="font-semibold">Record historical hours by date for this month</p>
          <p className="mt-1">A monthly total is unavailable because this period contains attendance or historical credits, or covers only part of the term. Choose a date below and enter only the hours worked on that date. Existing hours are kept separately.</p>
          {eligibility.data.qrDates.length>0 && <p className="mt-2">Dates with QR attendance: {eligibility.data.qrDates.join(', ')}. To correct those dates, use the student's attendance history.</p>}
          {!eligibility.data.availableDates.length && <p className="mt-2 font-medium">No uncovered dates are available. Review or amend existing records instead.</p>}
        </div>}
        <fieldset disabled={busy} className="min-w-0 space-y-3 disabled:opacity-60">
        <legend className="mb-3 text-sm font-semibold text-navy">2. Enter hours and supporting records</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {granularity === 'daily' && <label className="text-xs font-medium text-muted">Duty date{amendsId ? <input required type="date" min={availableDates.min} max={availableDates.max} value={workDate} readOnly className={field}/> : <select required value={workDate} onChange={event=>{setWorkDate(event.target.value);setHours('');}} className={field} disabled={eligibility.loading || !eligibility.data}><option value="">Choose an uncovered date</option>{(eligibility.data?.availableDates??[]).map(date=><option key={date} value={date}>{date}</option>)}</select>}</label>}
          <label className="text-xs font-medium text-muted">Verified hours<input required type="number" min="0.01" max={granularity === 'daily' ? '24' : '744'} step="0.01" value={hours} onChange={(event) => setHours(event.target.value)} className={field} placeholder={granularity === 'daily' ? 'e.g. 4.5' : 'e.g. 40.5'}/></label>
          <label className="text-xs font-medium text-muted">Verification source<input required minLength="3" maxLength="200" value={verificationSource} onChange={(event) => setVerificationSource(event.target.value)} className={field} placeholder="Paper DTR, office ledger…"/></label>
          <label className="text-xs font-medium text-muted sm:col-span-2">Supporting document or authorized reference<input required minLength="3" maxLength="500" value={verificationReference} onChange={(event) => setVerificationReference(event.target.value)} className={field} placeholder="DTR number, archive reference…"/></label>
        </div>
        <label className="block text-xs font-medium text-muted">Reason for historical entry<textarea required minLength={5} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className={field} placeholder="Explain why this verified historical duty credit is being recorded."/></label>
        </fieldset>
        {(term.finalized || exceptional || amendsId) && <p className="rounded-lg bg-info-bg p-3 text-sm text-info-fg">This entry requires administrator approval before it changes the student's hours.</p>}
        <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-11 items-start gap-2 py-2 text-sm text-ink"><input type="checkbox" disabled={busy} checked={exceptional} onChange={(event) => setExceptional(event.target.checked)} className="mt-0.5 h-4 w-4"/><span>Exceptional or disputed entry <span className="block text-xs text-muted">Requires administrator approval before hours count.</span></span></label>
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy || !term.months.length || !studentId || !periodReady}>{busy ? 'Saving…' : amendsId ? 'Submit amendment' : 'Record verified hours'}</Button>{amendsId && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setAmendsId(''); setMessage(''); }}>Cancel amendment</Button>}</div>
        </div>
        {message && <p role="status" className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info-fg">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      </form>}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Historical entries for the selected student and term</h3>
        {listQuery.loading && <p className="text-sm text-muted">Loading entries…</p>}
        {listQuery.error && <p role="alert" className="text-sm text-bad-fg">Unable to load entries: {listQuery.error}</p>}
        {!listQuery.loading && !listQuery.error && !entries.length && <p className="text-sm text-muted">No historical duty credits for this student and term.</p>}
        <ul className="space-y-2">{visibleEntries.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <div className="min-w-0"><p className="font-medium text-ink">{item.studentName} · {formatMonth(item.month)} · {formatHours(item.hours)}</p><p className="break-words text-xs text-muted">{item.granularity === 'daily' ? `${item.workDate} · ` : ''}{item.verificationSource} · Ref: {item.verificationReference}</p>{item.reviewNote && <p className="text-xs text-muted">Review: {item.reviewNote}</p>}</div>
          <div className="flex items-center gap-2"><Badge tone={item.status === 'approved' ? 'approved' : item.status === 'pending_admin' ? 'pending' : item.status === 'rejected' ? 'rejected' : 'neutral'}>{item.status.replaceAll('_', ' ')}</Badge>{item.status === 'approved' && <button type="button" onClick={() => startAmendment(item)} className="text-xs font-medium text-teal underline">Amend</button>}</div>
        </li>)}</ul>
        {listQuery.data && <Pagination page={currentPage} total={entries.length} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={listQuery.loading || busy} label="Historical duty entries pagination" recordLabel="Entries" />}
      </div>
    </Card>
  );
}
