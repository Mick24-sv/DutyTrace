import {FileSearch as UIActionFileSearch,PlusCircle as UIActionPlusCircle} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import DtrDocument from '../../components/dtr/DtrDocument.jsx';
import { useApiData } from '../../hooks/useApiData.js';
import { apiPost } from '../../services/api.js';
import { formatMonth } from '../../utils/format.js';

export default function DtrPreviewPage() {
  const { month } = useParams();
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '');
  const preview = useApiData(valid ? `/dtrs/preview?month=${month}` : null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function createDraft() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const dtr = await apiPost('/dtrs', { month });
      navigate(`/student/dtr/${dtr.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <>
    <Link to="/student/dtr" className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-teal underline">Back to monthly DTRs</Link>
    <PageHeader icon={UIActionFileSearch} title={valid ? `${formatMonth(month)} DTR preview` : 'Invalid DTR month'} description="Step 1 of 2: review your attendance and create a draft. You will submit it to your supervisor on the next page." />
    {preview.loading && <p role="status" className="text-sm text-muted">Loading this month's attendance…</p>}
    {(!valid || preview.error || error) && <p role="alert" className="mb-4 rounded-lg bg-bad-bg p-3 text-sm text-bad-fg">{!valid ? 'Choose a month from Monthly DTR.' : preview.error || error}</p>}
    {preview.data && <>
      <div className="mb-5 rounded-card border border-line bg-surface p-4">
        <p className="mb-3 text-sm text-muted">Check the times below. Creating a draft saves the document; supervisor approval is what verifies the hours.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button icon={UIActionPlusCircle} onClick={createDraft} disabled={busy}>{busy ? 'Creating draft…' : `Create ${formatMonth(month)} draft`}</Button>
          <Link to="/student/attendance" className="inline-flex min-h-11 items-center text-sm font-medium text-teal underline">Check attendance first</Link>
        </div>
      </div>
      <DtrDocument snapshot={preview.data} />
    </>}
  </>;
}
