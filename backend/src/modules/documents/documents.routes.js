import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/response.js';
import { parseId } from '../../utils/validate.js';
import { openForDownload } from './documents.service.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// Both read paths check record access; files have no public or signed URL.
async function serveFile(req, res, preview) {
  const file = await openForDownload({ user: req.user, id: parseId(req.params.id), ip: req.ip, preview });
  // Only validated PDF/PNG/JPEG files are stored by the upload service.
  const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.status(200).set({
    'Content-Type': file.mime,
    'Content-Length': String(file.size),
    'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store',
  });
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
}

documentsRouter.get('/:id/download', asyncHandler((req, res) => serveFile(req, res, false)));
documentsRouter.get('/:id/view', asyncHandler((req, res) => serveFile(req, res, true)));
