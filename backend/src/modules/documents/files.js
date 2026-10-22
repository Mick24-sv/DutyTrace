// Pure upload checks (no disk, no database). The CLIENT'S content type and file extension are never
// trusted on their own: the real type is decided from the file's first bytes ("magic numbers"), and the
// extension must agree with it.
import { AppError } from '../../utils/response.js';

const TYPES = [
  { kind: 'pdf', mime: 'application/pdf', exts: ['pdf'], match: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    kind: 'png', mime: 'image/png', exts: ['png'],
    match: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { kind: 'jpeg', mime: 'image/jpeg', exts: ['jpg', 'jpeg'], match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

export const ALLOWED_DESCRIPTION = 'PDF, PNG or JPEG';

// Keep a readable name for display/download only. It is NEVER used as a path on disk.
export function cleanFileName(raw) {
  const base = String(raw ?? '').split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').replace(/\s+/g, ' ').trim().slice(-120);
  return cleaned.replace(/^\.+/, '');
}

const bad = (code, message) => new AppError(400, code, message);

/** @returns { originalName, mime, size } or throws a 400 AppError */
export function validateUpload(buffer, rawName, maxBytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw bad('EMPTY_FILE', 'No file was received (or it was empty).');
  }
  if (buffer.length > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', `That file is larger than the allowed ${Math.floor(maxBytes / 1048576)} MB.`);
  }
  const originalName = cleanFileName(rawName);
  if (!originalName) throw bad('BAD_FILE_NAME', 'The file needs a name.');

  const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : '';
  const type = TYPES.find((t) => t.match(buffer));
  if (!type) throw bad('BAD_FILE_TYPE', `Only ${ALLOWED_DESCRIPTION} files are accepted.`);
  if (!type.exts.includes(ext)) {
    throw bad('BAD_FILE_TYPE', `The file name ends in ".${ext || '?'}" but its contents are ${type.kind.toUpperCase()}. Only ${ALLOWED_DESCRIPTION} files are accepted.`);
  }
  return { originalName, mime: type.mime, size: buffer.length };
}
