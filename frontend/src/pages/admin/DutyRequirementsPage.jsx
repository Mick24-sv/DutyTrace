import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiPut } from '../../services/api.js';

const field = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm';
const names = { institution: 'Institution', office: 'Office', student: 'Individual SA exception' };
const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function DutyRequirementsPage() {
  const termsQuery = useApiData('/semesters');
  const officesQuery = useApiData('/offices');
  const [termId, setTermId] = useState('');
  const [editingPolicyId, setEditingPolicyId] = useState('');
  const [tick, setTick] = useState(0);
  const contextQuery = useApiData(termId ? `/duty-schedules/admin/${termId}?_=${tick}` : null);
  const studentsQuery = useApiData(termId ? `/semesters/${termId}/requirements?_=${tick}` : null);
  const terms = termsQuery.data?.terms ?? [];
  const offices = officesQuery.data?.offices ?? [];
  const students = studentsQuery.data?.requirements ?? [];
  const [scopeType, setScopeType] = useState('institution');
  const [scopeId, setScopeId] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [hours, setHours] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [defaultMinimum, setDefaultMinimum] = useState('3');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [windows, setWindows] = useState([{ startTime: '08:00', endTime: '17:00' }]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (!termId && terms.length) setTermId(terms[0].id); }, [termId, terms]);
  const context = contextQuery.data;
  useEffect(() => {
    if (!context) return;
    setStarts(context.term.startsOn); setEnds(context.term.endsOn);
    setDefaultMinimum(String(context.defaultMinimumDailyHours));
  }, [context]);

  async function saveDefault(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiPut('/duty-schedules/admin/default', { minimumDailyHours: Number(defaultMinimum) });
      setMessage('Institution default minimum duty hours updated.'); setTick((n) => n + 1);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function savePolicy(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const policy = {
        termId, scopeType, ...(scopeType === 'institution' ? {} : { scopeId }),
        effectiveStartsOn: starts, effectiveEndsOn: ends, requiredTermHours: Number(hours),
        minimumDailyHours: minimum === '' ? null : Number(minimum), permittedWeekdays: days,
        maximumDailyHours: maximum === '' ? null : Number(maximum),
        permittedTimeWindows: windows,
        ...(scopeType === 'student' ? { exceptionReason: reason } : {}),
      };
      if (editingPolicyId) await apiPut(`/duty-schedules/admin/policies/${editingPolicyId}`, policy);
      else await apiPost('/duty-schedules/admin/policies', policy);
      setMessage(editingPolicyId ? 'Duty requirement updated and audited.' : 'Duty requirement saved and audited.'); setTick((n) => n + 1); setHours(''); setReason(''); setEditingPolicyId('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function editPolicy(policy) {
    setEditingPolicyId(policy.id); setScopeType(policy.scopeType); setScopeId(policy.scopeId);
    setStarts(policy.effectiveStartsOn); setEnds(policy.effectiveEndsOn); setHours(String(policy.requiredTermHours));
    setMinimum(policy.minimumDailyHours == null ? '' : String(policy.minimumDailyHours));
    setMaximum(policy.maximumDailyHours == null ? '' : String(policy.maximumDailyHours));
    setDays(policy.permittedWeekdays); setWindows(policy.permittedTimeWindows.map((window) => ({ startTime: window.startTime.slice(0, 5), endTime: window.endTime.slice(0, 5) })));
    setReason(policy.exceptionReason ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return <>
    <PageHeader title="Duty Requirements" description="Set term, office, or authorized individual duty rules. Individual exceptions take precedence and require a recorded reason." />
    {termsQuery.loading && <p role="status" className="text-sm text-muted">Loading academic terms…</p>}
    {termsQuery.error && <p role="alert" className="text-bad-fg">{termsQuery.error}</p>}
    {!terms.length && !termsQuery.loading && <Card><p>Create an academic term before configuring its duty requirements.</p></Card>}
    {!!terms.length && <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">Academic term<select className={`mt-1 block ${field}`} value={termId} onChange={(e) => setTermId(e.target.value)}>{terms.map((term) => <option key={term.id} value={term.id}>{term.academicYear} · {term.semester}</option>)}</select></label>
      </div>
      {context && <>
        <Card className="mb-5">
          <form onSubmit={saveDefault} className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-muted">Institution default minimum hours per duty day<input className={`mt-1 block ${field}`} type="number" min="0.25" max="24" step="0.25" required value={defaultMinimum} onChange={(e) => setDefaultMinimum(e.target.value)} /></label>
            <Button disabled={busy}>Save default</Button>
            <p className="text-sm text-muted">Currently {context.defaultMinimumDailyHours} hours. This is configurable, not a fixed daily requirement.</p>
          </form>
        </Card>
        <Card className="mb-5">
          <h2 className="mb-4 text-lg font-semibold">{editingPolicyId ? 'Edit duty policy' : 'Add a duty policy'}</h2>
          <form onSubmit={savePolicy} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-muted">Policy scope<select className={`mt-1 block w-full ${field}`} value={scopeType} onChange={(e) => { setScopeType(e.target.value); setScopeId(''); }}>
              {Object.entries(names).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {scopeType === 'office' && <label className="text-sm text-muted">Office<select className={`mt-1 block w-full ${field}`} required value={scopeId} onChange={(e) => setScopeId(e.target.value)}><option value="">Choose office</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>}
            {scopeType === 'student' && <><label className="text-sm text-muted">Student Assistant<select className={`mt-1 block w-full ${field}`} required value={scopeId} onChange={(e) => setScopeId(e.target.value)}><option value="">Choose SA</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.email}</option>)}</select></label><label className="text-sm text-muted md:col-span-2">Authorized exception reason<textarea required minLength="5" className={`mt-1 block w-full ${field}`} value={reason} onChange={(e) => setReason(e.target.value)} /></label></>}
            <label className="text-sm text-muted">Effective from<input className={`mt-1 block w-full ${field}`} type="date" required min={context.term.startsOn} max={context.term.endsOn} value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
            <label className="text-sm text-muted">Effective through<input className={`mt-1 block w-full ${field}`} type="date" required min={context.term.startsOn} max={context.term.endsOn} value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
            <label className="text-sm text-muted">Required total term hours<input className={`mt-1 block w-full ${field}`} type="number" min="0.25" max="10000" step="0.25" required value={hours} onChange={(e) => setHours(e.target.value)} /></label>
            <label className="text-sm text-muted">Minimum hours per duty day<input className={`mt-1 block w-full ${field}`} type="number" min="0.25" max="24" step="0.25" placeholder={`Default ${context.defaultMinimumDailyHours}`} value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label>
            <label className="text-sm text-muted">Maximum hours per duty day (optional)<input className={`mt-1 block w-full ${field}`} type="number" min="0.25" max="24" step="0.25" placeholder="No maximum" value={maximum} onChange={(e) => setMaximum(e.target.value)} /></label>
            <fieldset className="md:col-span-2"><legend className="mb-2 text-sm text-muted">Permitted duty days</legend><div className="flex flex-wrap gap-3">{week.map((name, i) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={days.includes(i + 1)} onChange={(e) => setDays((old) => e.target.checked ? [...old, i + 1].sort() : old.filter((day) => day !== i + 1))} />{name}</label>)}</div></fieldset>
            <fieldset className="md:col-span-2"><legend className="mb-2 text-sm text-muted">Permitted time windows</legend><div className="space-y-2">{windows.map((window, index) => <div key={index} className="flex flex-wrap items-end gap-3"><label className="text-sm text-muted">Window starts<input className={`mt-1 block ${field}`} type="time" required value={window.startTime} onChange={(e) => setWindows((items) => items.map((item, i) => i === index ? { ...item, startTime: e.target.value } : item))} /></label><label className="text-sm text-muted">Window ends<input className={`mt-1 block ${field}`} type="time" required value={window.endTime} onChange={(e) => setWindows((items) => items.map((item, i) => i === index ? { ...item, endTime: e.target.value } : item))} /></label>{windows.length > 1 && <Button type="button" onClick={() => setWindows((items) => items.filter((_, i) => i !== index))}>Remove window</Button>}</div>)}</div>{windows.length < 8 && <Button type="button" className="mt-2" onClick={() => setWindows((items) => [...items, { startTime: '12:00', endTime: '13:00' }])}>Add time window</Button>}</fieldset>
            <p className="self-end text-sm text-muted">Summer terms use the existing academic term type. Deadline: {context.term.completionDeadline ?? 'not configured'} (edit in Academic Terms).</p>
            <div className="flex gap-2"><Button disabled={busy || !days.length}>{busy ? 'Saving…' : editingPolicyId ? 'Update policy' : 'Save policy'}</Button>{editingPolicyId && <Button type="button" onClick={() => { setEditingPolicyId(''); setHours(''); setReason(''); }}>Cancel edit</Button>}</div>
          </form>
        </Card>
        {(message || error || contextQuery.error) && <p role={error || contextQuery.error ? 'alert' : 'status'} className={`mb-4 text-sm ${error || contextQuery.error ? 'text-bad-fg' : 'text-teal'}`}>{error || contextQuery.error || message}</p>}
        <Card><h2 className="mb-3 text-lg font-semibold">Configured policies</h2>{context.policies.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-muted"><th className="p-2">Scope</th><th className="p-2">Effective dates</th><th className="p-2">Required hours</th><th className="p-2">Min / max per day</th><th className="p-2">Days / windows</th><th className="p-2">Exception authorization</th><th className="p-2"></th></tr></thead><tbody>{context.policies.map((p) => <tr key={p.id} className="border-b border-line"><td className="p-2">{names[p.scopeType]} · {p.scopeName}</td><td className="p-2">{p.effectiveStartsOn} – {p.effectiveEndsOn}</td><td className="p-2">{p.requiredTermHours} h</td><td className="p-2">{p.minimumDailyHours ?? context.defaultMinimumDailyHours} h / {p.maximumDailyHours ?? 'no cap'}</td><td className="p-2">{p.permittedWeekdays.map((day) => week[day - 1].slice(0, 3)).join(', ')} · {p.permittedTimeWindows.map((w) => `${w.startTime}–${w.endTime}`).join(', ')}</td><td className="p-2">{p.exceptionReason ?? '—'}</td><td className="p-2"><Button type="button" onClick={() => editPolicy(p)}>Edit</Button></td></tr>)}</tbody></table></div> : <p className="text-sm text-muted">No policies configured for this term.</p>}</Card>
      </>}
    </>}
  </>;
}
