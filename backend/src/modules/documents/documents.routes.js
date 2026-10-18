import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/response.js';
import { parseId } from '../../utils/validate.js';
import { openForDownload } from './documents.service.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// The ONLY way to read an uploaded file. There is no static folder and no public/signed URL.
documentsRouter.get('/:id/download', asyncHandler(async (req, res) => {
  const file = await openForDownload({ user: req.user, id: parseId(req.params.id), ip: req.ip });
  // ASCII fallback + RFC 5987 name; always a download, never rendered inside our origin.
  const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.status(200).set({
    'Content-Type': file.mime,
    'Content-Length': String(file.size),
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store',
  });
  file.stream.on('error', () => res.destroy());
  file.stream.pipe(res);
}));
