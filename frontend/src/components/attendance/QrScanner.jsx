import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Camera-based QR scanner. Opens the camera, grabs frames ~8 times a second,
// and decodes them with jsQR (pure JavaScript, works in every modern browser).
// Browsers only allow camera access on HTTPS pages or on localhost.
//
// Calls onDetect(text) once, then the parent should unmount this component,
// which releases the camera. onUnavailable(message) is called if the camera
// can't be used so the page can offer manual entry instead.

const SCAN_INTERVAL_MS = 120;

const cameraErrorMessage = (err) => {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser, or enter the code manually.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Enter the code manually instead.';
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and try again, or enter the code manually.';
    default:
      return 'The camera could not be started. Enter the code manually instead.';
  }
};

export default function QrScanner({ onDetect, onUnavailable }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  // Keep the latest callbacks without restarting the camera when they change.
  const callbacks = useRef({ onDetect, onUnavailable });
  callbacks.current = { onDetect, onUnavailable };

  useEffect(() => {
    let stream;
    let frame;
    let cancelled = false;
    let lastScan = 0;
    let done = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      callbacks.current.onUnavailable(
        'Camera access needs a secure connection (HTTPS or localhost) and a supported browser. Enter the code manually instead.',
      );
      return undefined;
    }

    const tick = (now) => {
      if (cancelled || done) return;
      frame = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || video.readyState < video.HAVE_ENOUGH_DATA || now - lastScan < SCAN_INTERVAL_MS) return;
      lastScan = now;

      // Downscale big frames: decoding is faster and just as reliable.
      const scale = Math.min(1, 640 / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const canvas = canvasRef.current;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const result = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (result?.data) {
        done = true; // report only the first code
        callbacks.current.onDetect(result.data);
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        video.srcObject = s;
        await video.play();
        setReady(true);
        frame = requestAnimationFrame(tick);
      })
      .catch((err) => {
        if (!cancelled) callbacks.current.onUnavailable(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop()); // turn the camera off
    };
  }, []);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-card border border-line bg-navy">
        {/* muted + playsInline are required for video to start on phones */}
        <video ref={videoRef} muted playsInline aria-label="Camera preview" className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Framing guide */}
        <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-teal" aria-hidden="true" />
      </div>
      <p role="status" className="mt-3 text-center text-sm text-muted">
        {ready ? 'Point the camera at the office QR code.' : 'Starting camera…'}
      </p>
    </div>
  );
}
