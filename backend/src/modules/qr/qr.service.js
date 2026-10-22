import crypto from 'node:crypto';
import { env } from '../../config/env.js';

// QR payload format:  DT1.<qr-code-id>.<signature>
//   - qr-code-id : uuid of a row in office_qr_codes
//   - signature  : HMAC-SHA256(server secret, id), base64url
// The signature proves the code was issued by this server, so random or edited
// QR codes are rejected without a database lookup. Whether the code is still
// valid (not revoked) and which office it belongs to come from the database.

const PREFIX = 'DT1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (id) =>
  crypto.createHmac('sha256', env.qrSecret).update(`dutytrace-qr-v1:${id}`).digest('base64url');

export const buildPayload = (qrCodeId) => `${PREFIX}.${qrCodeId}.${sign(qrCodeId)}`;

// Returns the qr-code id if the payload is well-formed AND correctly signed, else null.
export function readPayload(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length > 200) return null;
  const parts = text.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !UUID_RE.test(parts[1])) return null;

  const given = Buffer.from(parts[2]);
  const expected = Buffer.from(sign(parts[1].toLowerCase()));
  // timingSafeEqual requires equal lengths; different length means not equal.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return parts[1].toLowerCase();
}
