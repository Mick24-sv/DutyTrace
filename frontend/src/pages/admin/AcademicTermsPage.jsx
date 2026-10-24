import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, LockKeyhole } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import TimezoneSelect from '../../components/ui/TimezoneSelect.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost, apiPut } from '../../services/api.js';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';
const semesterLabels = { first: '1st Semester', second: '2nd Semester', summer: 'Summer Term' };
const emptyTerm = (timezone) => ({
  academicYear: '',
  semester: 'first',
  startsOn: '',
  endsOn: '',
  completionDeadline: '',
  timezone,
});

function RequirementRow({ student, offices, locked, reload, mobile = false }) {
  const [hours, setHours] = useState(student.requiredHours == null ? '' : String(student.requiredHours));
  const [officeId, setOfficeId] = useState(student.officeId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHours(student.requiredHours == null ? '' : String(student.requiredHours));
    setOfficeId(student.officeId ?? '');
  }, [student]);

  async function save() {
    if (!hours && student.requiredHours == null) return;
    setBusy(true);
    setError('');
    try {
      await apiPut(`/semesters/${student.termId}/requirements/${student.id}`, {
        officeId,
        requiredHours: hours.trim() ? Number(hours) : null,
      });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (mobile) {
    return (
      <article className="rounded-lg border border-line p-3">
        <div className="mb-3 min-w-0">
          <p className="break-words font-medium text-ink">{student.fullName}</p>
          <p className="break-all text-xs text-muted">{student.email}</p>
        </div>
        <div className="grid gap-3">
          <label className="block text-xs font-medium text-muted">Assigned office
            <select aria-label={`Requirement office for ${student.fullName}`} className={`${field} mt-1`} value={officeId} onChange={(event) => setOfficeId(event.target.value)} disabled={locked}>
              <option value="">Select office</option>
              {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted">Required hours
            <input type="number" min="0.01" max="10000" step="0.01" aria-label={`Required semester hours for ${student.fullName}`} placeholder="No requirement" className={`${field} mt-1`} value={hours} onChange={(event) => setHours(event.target.value)} disabled={locked} />
          </label>
          <Button type="button" className="w-full" onClick={save} disabled={locked || busy || !officeId}>
            {busy ? 'Saving…' : hours === '' && student.requiredHours != null ? 'Remove requirement' : 'Save requirement'}
          </Button>
          {error && <p role="alert" className="text-xs text-bad-fg">{error}</p>}
        </div>
      </article>
    );
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-3 pr-4">
        <span className="font-medium text-ink">{student.fullName}</span>
        <span className="block text-xs text-muted">{student.email}</span>
      </td>
      <td className="py-3 pr-4">
        <select
          aria-label={`Requirement office for ${student.fullName}`}
          className="max-w-56 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          value={officeId}
          onChange={(event) => setOfficeId(event.target.value)}
          disabled={locked}
        >
          <option value="">Select office</option>
          {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select>
      </td>
      <td className="py-3 pr-4">
        <input
          type="number"
          min="0.01"
          max="10000"
          step="0.01"
          aria-label={`Required semester hours for ${student.fullName}`}
          placeholder="No requirement"
          className="w-36 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          disabled={locked}
        />
      </td>
      <td className="py-3">
        <Button type="button" onClick={save} disabled={locked || busy || !officeId}>
          {busy ? 'Saving…' : hours === '' && student.requiredHours != null ? 'Remove' : 'Save'}
        </Button>
        {error && <p role="alert" className="mt-1 text-xs text-bad-fg">{error}</p>}
      </td>
    </tr>
  );
}

export default function AcademicTermsPage() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const termsQuery = useApiData(`/semesters?_=${tick}`);
  const officesQuery = useApiData('/offices');
  const terms = termsQuery.data?.terms ?? [];
  const offices = officesQuery.data?.offices ?? [];
  const institution = useApiData('/institutions/me');
  const [institutionForm, setInstitutionForm] = useState({
    name: user?.institution?.name ?? '',
    timezone: user?.institution?.timezone ?? 'UTC',
  });
  const [institutionBusy, setInstitutionBusy] = useState(false);
  const [institutionMessage, setInstitutionMessage] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const selected = terms.find((term) => term.id === selectedId) ?? null;
  const [form, setForm] = useState(() => emptyTerm(user?.institution?.timezone ?? 'UTC'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requirementsQuery = useApiData(selected ? `/semesters/${selected.id}/requirements?_=${tick}` : null);
  const requirementRows = (requirementsQuery.data?.requirements ?? []).map((student) => ({
    ...student,
    termId: selected?.id,
  }));

  useEffect(() => {
    if (institution.data?.institution) {
      setInstitutionForm({
        name: institution.data.institution.name,
        timezone: institution.data.institution.timezone,
      });
    }
  }, [institution.data]);

  useEffect(() => {
    if (!selected) {
      setForm(emptyTerm(user?.institution?.timezone ?? 'UTC'));
      return;
    }
    setForm({
      academicYear: selected.academicYear,
      semester: selected.semester,
      startsOn: selected.startsOn,
      endsOn: selected.endsOn,
      completionDeadline: selected.completionDeadline ?? '',
      timezone: selected.timezone,
    });
  }, [selected, user?.institution?.timezone]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const reload = () => setTick((value) => value + 1);

  async function saveTerm(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...form, completionDeadline: form.completionDeadline || null };
      if (selected) await apiPut(`/semesters/${selected.id}`, payload);
      else await apiPost('/semesters', payload);
      setSelectedId('');
      reload();
    } catch (err) {
      setError(err.details ? Object.values(err.details).join(' ') : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveInstitution(event) {
    event.preventDefault();
    setInstitutionBusy(true);
    setInstitutionMessage(null);
    try {
      const updated = await apiPut('/institutions/me', institutionForm);
      setInstitutionForm({ name: updated.institution.name, timezone: updated.institution.timezone });
      setForm((current) => selected ? current : ({ ...current, timezone: updated.institution.timezone }));
      setInstitutionMessage({ ok: true, text: 'Institution settings saved.' });
      reload();
    } catch (err) {
      setInstitutionMessage({ ok: false, text: err.message });
    } finally {
      setInstitutionBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Academic Terms"
        description={`${user?.institution?.name ?? 'Institution'} academic calendar and Student Assistant semester requirements.`}
      />
      <Card title="Institution settings">
        <form onSubmit={saveInstitution} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="institution-name" className="mb-1 block text-xs font-medium text-muted">Institution</label>
            <input id="institution-name" className={field} value={institutionForm.name} onChange={(event) => setInstitutionForm((f) => ({ ...f, name: event.target.value }))} required />
          </div>
          <div>
            <label htmlFor="institution-timezone" className="mb-1 block text-xs font-medium text-muted">Default timezone</label>
            <TimezoneSelect id="institution-timezone" className={field} value={institutionForm.timezone} onChange={(event) => setInstitutionForm((f) => ({ ...f, timezone: event.target.value }))} required />
          </div>
          {institutionMessage && <p role={institutionMessage.ok ? 'status' : 'alert'} className={`sm:col-span-2 text-sm ${institutionMessage.ok ? 'text-ok-fg' : 'text-bad-fg'}`}>{institutionMessage.text}</p>}
          <div><Button type="submit" disabled={institutionBusy}>{institutionBusy ? 'Saving…' : 'Save institution settings'}</Button></div>
        </form>
        {institution.error && <p role="alert" className="mt-2 text-sm text-bad-fg">{institution.error}</p>}
      </Card>
      <Card title="Terms">
        {termsQuery.loading && <p role="status" className="text-sm text-muted">Loading academic terms…</p>}
        {termsQuery.error && <p role="alert" className="text-sm text-bad-fg">{termsQuery.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setSelectedId('')}>Create term</Button>
          <select
            aria-label="Choose academic term to edit"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="min-w-64 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">New academic term</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.academicYear} · {semesterLabels[term.semester]}{term.finalizedAt ? ' · Finalized' : ''}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title={selected ? 'Edit academic term' : 'Create academic term'} className="mt-6">
        <form onSubmit={saveTerm} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="academic-year" className="mb-1 block text-xs font-medium text-muted">Academic year</label>
            <input id="academic-year" className={field} placeholder="For example, 2026-2027" value={form.academicYear} onChange={set('academicYear')} required disabled={Boolean(selected?.finalizedAt)} />
          </div>
          <div>
            <label htmlFor="semester" className="mb-1 block text-xs font-medium text-muted">Semester</label>
            <select id="semester" className={field} value={form.semester} onChange={set('semester')} disabled={Boolean(selected?.finalizedAt)}>
              {Object.entries(semesterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="term-start" className="mb-1 block text-xs font-medium text-muted">Start date</label>
            <input id="term-start" type="date" className={field} value={form.startsOn} onChange={set('startsOn')} required disabled={Boolean(selected?.finalizedAt)} />
          </div>
          <div>
            <label htmlFor="term-end" className="mb-1 block text-xs font-medium text-muted">End date</label>
            <input id="term-end" type="date" className={field} value={form.endsOn} onChange={set('endsOn')} required disabled={Boolean(selected?.finalizedAt)} />
          </div>
          <div>
            <label htmlFor="completion-deadline" className="mb-1 block text-xs font-medium text-muted">Completion deadline (optional)</label>
            <input id="completion-deadline" type="date" className={field} value={form.completionDeadline} onChange={set('completionDeadline')} disabled={Boolean(selected?.finalizedAt)} />
          </div>
          <div>
            <label htmlFor="term-timezone" className="mb-1 block text-xs font-medium text-muted">Institution timezone</label>
            <TimezoneSelect id="term-timezone" className={field} value={form.timezone} onChange={set('timezone')} required disabled={Boolean(selected?.finalizedAt)} />
          </div>
          {error && <p role="alert" className="sm:col-span-2 text-sm text-bad-fg">{error}</p>}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || Boolean(selected?.finalizedAt)}>{busy ? 'Saving…' : 'Save term'}</Button>
            {selected && !selected.finalizedAt && (
              <Link to="/admin/semester-transitions" className="inline-flex items-center rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy/90">
                <LockKeyhole className="mr-2 inline h-4 w-4" /> Open semester transition planner
              </Link>
            )}
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Terms cannot overlap within one institution. Finalizing freezes the term calendar and prevents later requirement changes; monthly DTRs remain independent.
        </p>
      </Card>

      {selected && (
        <Card title="Individual duty-hour requirements" className="mt-6">
          <p className="mb-4 text-sm text-muted">
            Assign a requirement separately to each student for this term. Leave the hours blank for no assigned requirement. Each save is recorded in the audit history.
          </p>
          {selected.finalizedAt && <p className="mb-3 text-sm text-warn-fg">This term is finalized; assignments are read-only.</p>}
          {requirementsQuery.loading && <p role="status" className="text-sm text-muted">Loading students…</p>}
          {requirementsQuery.error && <p role="alert" className="text-sm text-bad-fg">{requirementsQuery.error}</p>}
          {requirementsQuery.data && (
            <>
              <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead><tr className="border-b border-line text-xs text-muted">
                  <th className="pb-2 pr-4">Student Assistant</th><th className="pb-2 pr-4">Assigned office</th>
                  <th className="pb-2 pr-4">Required hours</th><th className="pb-2">Action</th>
                </tr></thead>
                <tbody>
                  {requirementRows.map((student) => (
                    <RequirementRow key={student.id} student={student} offices={offices} locked={Boolean(selected.finalizedAt)} reload={reload} />
                  ))}
                </tbody>
              </table>
              </div>
              <div className="space-y-3 sm:hidden">
                {requirementRows.map((student) => <RequirementRow key={student.id} mobile student={student} offices={offices} locked={Boolean(selected.finalizedAt)} reload={reload} />)}
              </div>
              {requirementRows.length === 0 && <p className="py-4 text-sm text-muted">No student accounts in this institution.</p>}
            </>
          )}
        </Card>
      )}

      {!termsQuery.loading && terms.length === 0 && (
        <div className="mt-6 flex items-start gap-2 rounded-lg bg-info-bg p-4 text-sm text-info-fg">
          <CalendarRange className="mt-0.5 h-4 w-4 shrink-0" />
          Create the institution's first academic term; no school calendar is assumed by DutyTrace.
        </div>
      )}
    </>
  );
}
