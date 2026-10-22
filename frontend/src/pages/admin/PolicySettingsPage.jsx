import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPut } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

// Institution-specific monthly DTR policy. Changing the target affects only DTRs
// generated after the change; existing revisions keep their original snapshot.
export default function PolicySettingsPage() {
  const { data, loading, error } = useApiData('/dtrs/policy');
  const attendanceSettings=useApiData('/institutions/me');
  const [policy, setPolicy] = useState(null);
  const [hours, setHours] = useState('');
  const [reviewSlaHours, setReviewSlaHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }
  const [attendancePolicy,setAttendancePolicy]=useState({discrepancyGraceMinutes:30,earlyToleranceMinutes:15,lateToleranceMinutes:15});
  const [attendanceBusy,setAttendanceBusy]=useState(false);const [attendanceMessage,setAttendanceMessage]=useState(null);

  useEffect(() => {
    if (data) {
      setPolicy(data);
      setHours(String(data.requiredMonthlyHours));
      setReviewSlaHours(data.reviewSlaHours == null ? '' : String(data.reviewSlaHours));
    }
  }, [data]);

  useEffect(()=>{const i=attendanceSettings.data?.institution;if(i)setAttendancePolicy({
    discrepancyGraceMinutes:i.attendanceDiscrepancyGraceMinutes,earlyToleranceMinutes:i.attendanceEarlyToleranceMinutes,lateToleranceMinutes:i.attendanceLateToleranceMinutes,
  });},[attendanceSettings.data]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const updated = await apiPut('/dtrs/policy', {
        requiredMonthlyHours: Number(hours),
        reviewSlaHours: reviewSlaHours.trim() === '' ? null : Number(reviewSlaHours),
      });
      setPolicy(updated); setMessage({ ok: true, text: 'Saved.' });
      setReviewSlaHours(updated.reviewSlaHours == null ? '' : String(updated.reviewSlaHours));
    } catch (err) {
      setMessage({ ok: false, text: err.details?.requiredMonthlyHours ?? err.message });
    } finally { setBusy(false); }
  }

  async function saveAttendancePolicy(e){e.preventDefault();setAttendanceBusy(true);setAttendanceMessage(null);try{
    const updated=await apiPut('/institutions/me/attendance-policy',attendancePolicy);
    setAttendancePolicy({discrepancyGraceMinutes:updated.institution.attendanceDiscrepancyGraceMinutes,
      earlyToleranceMinutes:updated.institution.attendanceEarlyToleranceMinutes,lateToleranceMinutes:updated.institution.attendanceLateToleranceMinutes});
    setAttendanceMessage({ok:true,text:'Attendance policy saved.'});
  }catch(err){setAttendanceMessage({ok:false,text:err.details?.discrepancyGraceMinutes??err.message});}finally{setAttendanceBusy(false);}}

  return (
    <>
      <PageHeader title="Policy Settings" description="Monthly DTR settings for your institution. Semester targets are assigned individually under Academic Terms." />
      {loading && <p role="status" className="text-sm text-muted">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{error}</p>}
      {policy && (
        <Card title="Default institutional duty hours" className="max-w-xl">
          <form onSubmit={save} noValidate>
            <label htmlFor="required-hours" className="mb-1 block text-sm font-medium">Default required hours per month</label>
            <input
              id="required-hours" type="number" step="0.5" min="0" value={hours} onChange={(e) => setHours(e.target.value)}
              className="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-muted">
              This serves as the default baseline requirement for student assistants. You can configure and customize individual required duty hours for any specific student under the <strong className="text-ink">Users & Roles</strong> page.
              {policy.updatedBy && <> Last changed by {policy.updatedBy} on {formatDateTime(policy.updatedAt, policy.timezone)}.</>}
            </p>
            <label htmlFor="review-sla-hours" className="mb-1 mt-5 block text-sm font-medium">Review time limit (optional)</label>
            <div className="flex items-center gap-2">
              <input
                id="review-sla-hours" type="number" step="1" min="1" max="720" value={reviewSlaHours}
                onChange={(e) => setReviewSlaHours(e.target.value)} placeholder="Not configured"
                className="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              <span className="text-sm text-muted">hours</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              When set, supervisors and administrators receive an in-app reminder during the final 24 hours and again when a DTR, absence notice, or case review becomes overdue. Leave blank to disable review deadline reminders.
            </p>
            {message && (
              <p role={message.ok ? 'status' : 'alert'} className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}>{message.text}</p>
            )}
            <Button type="submit" className="mt-4" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </form>
        </Card>
      )}
      <Card title="Attendance discrepancy timing" className="mt-6 max-w-xl">
        <p className="mb-4 text-sm text-muted">Set when automated shift checks run and how much timing variation is accepted. These settings apply to future reconciliation checks for this institution.</p>
        {attendanceSettings.loading&&<p className="text-sm text-muted">Loading attendance policy…</p>}
        {attendanceSettings.error&&<p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{attendanceSettings.error}</p>}
        {!attendanceSettings.loading&&attendanceSettings.data&&<form onSubmit={saveAttendancePolicy} className="space-y-4">
          {[['discrepancyGraceMinutes','Grace period after shift ends','minutes'],['earlyToleranceMinutes','Allowed early clock-in tolerance','minutes'],['lateToleranceMinutes','Allowed late clock-out tolerance','minutes']].map(([key,label,unit])=><label key={key} className="block text-sm font-medium text-ink">{label}<div className="mt-1 flex items-center gap-2"><input type="number" min="0" max="1440" step="1" required value={attendancePolicy[key]} onChange={e=>setAttendancePolicy(p=>({...p,[key]:Number(e.target.value)}))} className="w-32 rounded-lg border border-line bg-surface px-3 py-2"/><span className="text-sm text-muted">{unit}</span></div></label>)}
          {attendanceMessage&&<p role={attendanceMessage.ok?'status':'alert'} className={`rounded-lg px-3 py-2 text-sm ${attendanceMessage.ok?'bg-ok-bg text-ok-fg':'bg-bad-bg text-bad-fg'}`}>{attendanceMessage.text}</p>}
          <Button type="submit" disabled={attendanceBusy}>{attendanceBusy?'Saving…':'Save attendance policy'}</Button>
        </form>}
      </Card>
      <Card title="Other settings" className="mt-6 max-w-xl">
        <ul className="space-y-1 text-sm text-muted">
          <li>Time zone: <strong className="text-ink">{policy?.timezone ?? '…'}</strong> (set by APP_TIMEZONE on the server)</li>
          <li>DTR template: <strong className="text-ink">Provisional</strong>, not your institution's official form</li>
        </ul>
      </Card>
    </>
  );
}
