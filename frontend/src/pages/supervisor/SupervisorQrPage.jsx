import { Printer, QrCode } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import QrCodeImage from '../../components/attendance/QrCodeImage.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { formatDateTime } from '../../utils/format.js';

// Supervisors can show and print the QR issued by an administrator for their
// assigned office. They cannot create or revoke codes.
export default function SupervisorQrPage() {
  const { data, loading, error } = useApiData('/supervisor/office-qr');
  const active = data?.active;

  return (
    <>
      <PageHeader
        title="Office QR Code"
        description="Show this code to Student Assistants or print and post it in your office. They scan it to time in and out."
      />

      {loading && <p role="status" className="text-sm text-muted">Loading office QR code…</p>}
      {error && <p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{error}</p>}

      {data && (
        <Card
          title={`${data.office.code}: ${data.office.name}`}
          action={<Badge tone={active ? 'approved' : 'rejected'}>{active ? 'Active' : 'No active code'}</Badge>}
        >
          {active ? (
            <div className="flex flex-col items-center text-center">
              <QrCodeImage text={active.payload} label={`Attendance QR code for ${data.office.name}`} />
              <p className="mt-3 text-sm text-muted">Current office attendance code</p>
              <p className="mt-1 text-xs text-muted">Issued {formatDateTime(active.createdAt)}</p>
              <div className="no-print mt-5">
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" aria-hidden="true" />Print QR code
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <QrCode className="mx-auto h-9 w-9 text-teal" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted">
                There is no active QR code for this office. Ask an administrator to generate one under Office QR Codes.
              </p>
            </div>
          )}
          <p className="mt-5 text-center text-xs text-muted">
            Only share this code with Student Assistants assigned to this office. Administrators manage replacement and revocation.
          </p>
        </Card>
      )}
    </>
  );
}
