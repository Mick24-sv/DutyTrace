import { useEffect, useState } from 'react';
import { Printer, QrCode, RefreshCw, ShieldOff } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import QrCodeImage from '../../components/attendance/QrCodeImage.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiGet, apiPost } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';

// Administrators generate, regenerate and revoke each office's QR code, and print it.
export default function QrCodesPage() {
  const offices = useApiData('/offices');
  const [chosen, setChosen] = useState('');
  const officeId = chosen || offices.data?.offices[0]?.id || '';

  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'revoke'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!officeId) return undefined;
    let cancelled = false;
    setView(null);
    setLoadError('');
    setActionError('');
    apiGet(`/offices/${officeId}/qr`)
      .then((d) => !cancelled && setView(d))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => { cancelled = true; };
  }, [officeId]);

  const act = async (path) => {
    setBusy(true);
    setActionError('');
    try {
      setView(await apiPost(`/offices/${officeId}/qr${path}`));
      setConfirm(null);
    } catch (e) {
      setActionError(e.message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const active = view?.active;

  return (
    <>
      <PageHeader title="Office QR Codes" description="Each office has one valid QR code. Print it and post it at the office.">
        <div className="no-print">
          <label htmlFor="office" className="mb-1 block text-xs font-medium text-muted">Office</label>
          <select
            id="office" value={officeId} onChange={(e) => setChosen(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            {offices.data?.offices.map((o) => <option key={o.id} value={o.id}>{o.code}: {o.name}</option>)}
          </select>
        </div>
      </PageHeader>

      {offices.error && <p role="alert" className="text-sm text-bad-fg">{offices.error}</p>}
      {loadError && <p role="alert" className="text-sm text-bad-fg">{loadError}</p>}
      {actionError && <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">{actionError}</p>}

      {view && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card
            title={`${view.office.code}: ${view.office.name}`}
            action={<Badge tone={active ? 'approved' : 'rejected'}>{active ? 'Active' : 'No active code'}</Badge>}
            className="lg:col-span-2"
          >
            {active ? (
              <div className="flex flex-col items-center text-center">
                <QrCodeImage text={active.payload} label={`QR code for ${view.office.name}`} />
                <p className="mt-3 text-base font-semibold text-navy">{view.office.name}</p>
                <p className="text-sm text-muted">DutyTrace attendance: scan to time in or out</p>
                <p className="no-print mt-1 text-xs text-muted">Issued {formatDateTime(active.createdAt)}</p>

                <details className="no-print mt-4 w-full max-w-md text-left">
                  <summary className="cursor-pointer text-sm font-medium text-teal">Show code text (for manual entry / testing)</summary>
                  <p className="mt-2 break-all rounded-lg bg-canvas p-3 font-mono text-xs">{active.payload}</p>
                  <p className="mt-1 text-xs text-muted">Anyone with this text can use it to scan. Share it only with administrators.</p>
                </details>
              </div>
            ) : (
              <div className="py-8 text-center">
                <QrCode className="mx-auto h-9 w-9 text-teal" aria-hidden="true" />
                <p className="mt-3 text-sm text-muted">
                  This office has no valid QR code, so nobody can record attendance here until one is generated.
                </p>
              </div>
            )}

            <div className="no-print mt-6 flex flex-wrap justify-center gap-2">
              {active ? (
                <>
                  <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Print</Button>
                  <Button variant="secondary" onClick={() => setConfirm('regenerate')}><RefreshCw className="h-4 w-4" aria-hidden="true" />Regenerate</Button>
                  <Button variant="secondary" onClick={() => setConfirm('revoke')}><ShieldOff className="h-4 w-4" aria-hidden="true" />Revoke</Button>
                </>
              ) : (
                <Button variant="accent" disabled={busy} onClick={() => act('')}>
                  <QrCode className="h-4 w-4" aria-hidden="true" />Generate QR code
                </Button>
              )}
            </div>
          </Card>

          <Card title="Previous codes" className="no-print">
            {view.history.length === 0 ? (
              <p className="text-sm text-muted">No earlier codes for this office.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {view.history.map((h) => (
                  <li key={h.id} className="py-2">
                    <p>Issued {formatDateTime(h.createdAt)}</p>
                    <p className="text-xs text-muted">Revoked {formatDateTime(h.revokedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              Old codes stop working immediately. A photo of a printed code could be scanned from elsewhere, so
              regenerate it if you think it has leaked.
            </p>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'regenerate'} title="Regenerate this office's QR code?" confirmLabel="Regenerate" busy={busy}
        onCancel={() => setConfirm(null)} onConfirm={() => act('/regenerate')}
      >
        The current code will stop working immediately. You must print and post the new one, or nobody at this
        office can record attendance.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'revoke'} title="Revoke this office's QR code?" confirmLabel="Revoke" busy={busy}
        onCancel={() => setConfirm(null)} onConfirm={() => act('/revoke')}
      >
        The current code will stop working immediately and the office will have no valid code until you generate
        a new one.
      </ConfirmDialog>
    </>
  );
}
