import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Draws a QR code for `text` as an image. Always black on white (not palette
// colours): maximum contrast is what makes phone cameras read it reliably.
export default function QrCodeImage({ text, size = 288, label }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(text, { width: size, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [text, size]);

  if (failed) return <p role="alert" className="text-sm text-bad-fg">Could not draw the QR code.</p>;
  if (!src) return <div style={{ width: size, height: size }} className="rounded bg-canvas" aria-hidden="true" />;
  return <img src={src} width={size} height={size} alt={label} className="rounded border border-line bg-white" />;
}
