import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CircleX, QrCode, TriangleAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import QrScanner from '../../components/attendance/QrScanner.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { apiPost } from '../../services/api.js';
import { ROLE_CONFIG } from '../../routes/navConfig.js';
import { formatDuration, formatTime } from '../../utils/format.js';

// Shared by Student Assistants and Supervisors: each records their OWN attendance.
// The page never sends a user id or a time. The server uses the signed-in user
// and its own clock.
export default function ScanPage() {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  // `v` is ignored by the server; changing it makes the hook fetch fresh status.
  const status = useApiData(`/attendance/status?v=${version}`);

  const [mode, setMode] = useState('idle'); // idle | scanning | submitting | done
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);

  const tz = status.data?.timezone;
  const timedIn = status.data?.state === 'timed_in';
  const action = timedIn ? 'time_out' : 'time_in';
  const actionLabel = timedIn ? 'Time out' : 'Time in';
  const attendancePath = `${ROLE_CONFIG[user.role].base}/attendance`;

  const submit = async (qrPayload) => {
    setMode('submitting');
    setFailure(null);
    try {
      const data = await apiPost('/attendance/scan', { action, qrPayload });
      setResult(data);
      setMode('done');
      setVersion((v) => v + 1);
    } catch (err) {
      setFailure({ message: err.message, code: err.code });
      setMode('idle');
    }
  };

  const startScan = () => {
    setResult(null);
    setFailure(null);
    setCameraMessage('');
    setManualOpen(false);
    setMode('scanning');
  };

  const manualForm = (
    <form
      onSubmit={(e) => { e.preventDefault(); if (manualText.trim()) submit(manualText.trim()); }}
      className="mx-auto mt-4 max-w-sm"
    >
      <label htmlFor="manual-code" className="mb-1 block text-sm font-medium">QR code text</label>
      <input
        id="manual-code" value={manualText} onChange={(e) => setManualText(e.target.value)}
        autoComplete="off" spellCheck="false" placeholder="DT1.…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs"
      />
      <Button type="submit" variant="accent" className="mt-3 w-full" disabled={!manualText.trim() || mode === 'submitting'}>
        Submit code &amp; {actionLabel.toLowerCase()}
      </Button>
    </form>
  );

  return (
    <>
      <PageHeader title="Scan QR" description="Scan your office's QR code to record your own time-in or time-out." />

      <div className="mx-auto max-w-xl space-y-6">
        <Card title="Your status">
          {status.loading && <p role="status" className="text-sm text-muted">Checking status…</p>}
          {status.error && <p role="alert" className="text-sm text-bad-fg">{status.error}</p>}
          {status.data && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone={timedIn ? 'pending' : 'neutral'}>{timedIn ? 'Timed in' : 'Not timed in'}</Badge>
                <p className="mt-2 text-sm text-muted">
                  {timedIn && `Since ${formatTime(status.data.since, tz)}. `}
                  {status.data.office ? `Office: ${status.data.office.name}` : 'No office assigned.'}
                </p>
              </div>
              <Link to={attendancePath} className="text-sm font-medium text-teal underline">View my attendance</Link>
            </div>
          )}
        </Card>

        {status.data && !status.data.office && (
          <p role="alert" className="flex items-start gap-2 rounded-card bg-warn-bg px-4 py-3 text-sm text-warn-fg">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            You are not assigned to an office yet, so you cannot record attendance. Ask an administrator.
          </p>
        )}

        {failure && (
          <div role="alert" className="flex items-start gap-3 rounded-card bg-bad-bg px-4 py-3 text-sm text-bad-fg">
            <CircleX className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{actionLabel} was not recorded</p>
              <p className="mt-0.5">{failure.message}</p>
            </div>
          </div>
        )}

        {mode === 'done' && result && (
          <div role="status" className="flex items-start gap-3 rounded-card bg-ok-bg px-4 py-3 text-sm text-ok-fg">
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {result.event.type === 'time_in' ? 'Timed in' : 'Timed out'} at {formatTime(result.event.recordedAt, result.timezone)}
              </p>
              <p className="mt-0.5">{result.office.name}</p>
              {result.session && (
                <p className="mt-0.5">
                  Session length: {formatDuration(result.session.seconds)}
                  {result.session.needsReview && ' (longer than allowed; it will be flagged for review and not counted)'}
                </p>
              )}
            </div>
          </div>
        )}

        <Card title={mode === 'scanning' ? `Scan to ${actionLabel.toLowerCase()}` : 'Record attendance'}>
          {mode === 'scanning' || mode === 'submitting' ? (
            <>
              {mode === 'scanning' && !cameraMessage && (
                <QrScanner onDetect={submit} onUnavailable={(msg) => { setCameraMessage(msg); setManualOpen(true); }} />
              )}
              {mode === 'submitting' && <p role="status" className="text-center text-sm text-muted">Recording…</p>}
              {cameraMessage && (
                <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">{cameraMessage}</p>
              )}
              {mode === 'scanning' && (
                <>
                  {!manualOpen && !cameraMessage && (
                    <p className="mt-3 text-center">
                      <button type="button" className="text-sm font-medium text-teal underline" onClick={() => setManualOpen(true)}>
                        Camera not working? Enter the code manually
                      </button>
                    </p>
                  )}
                  {manualOpen && manualForm}
                  <div className="mt-4 text-center">
                    <Button variant="secondary" onClick={() => setMode('idle')}>Cancel</Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-sm text-muted">
                {timedIn
                  ? 'You are timed in. Scan the QR code again when your duty ends.'
                  : 'Scan the QR code posted at your office when you start duty.'}
              </p>
              <Button variant="accent" onClick={startScan} disabled={!status.data?.office} className="px-6 py-3 text-base">
                <QrCode className="h-5 w-5" aria-hidden="true" />
                Scan QR to {actionLabel.toLowerCase()}
              </Button>
            </div>
          )}
        </Card>

        <p className="text-xs text-muted">
          Your time is recorded by the server when you scan; it cannot be edited here. You can only record your own attendance,
          and only with your own office&apos;s QR code.
        </p>
      </div>
    </>
  );
}
