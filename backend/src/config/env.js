// Central place for reading environment variables, so the rest of the code
// never touches process.env directly and defaults are visible in one file.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load backend/.env if it exists (real environment variables still win).
// Done here instead of with a CLI flag because `node --watch` crashes when a
// flagged env file is missing.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const toInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const toBool = (value) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());

const nodeEnv = process.env.NODE_ENV ?? 'development';
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const databaseUrl = process.env.DATABASE_URL;
const databaseSsl = toBool(process.env.DATABASE_SSL);
const qrSecret = process.env.QR_SIGNING_SECRET;
const trustProxy = toInt(process.env.TRUST_PROXY, 0, { min: 0 });
const uploadDir = process.env.UPLOAD_DIR ?? fileURLToPath(new URL('../../uploads/', import.meta.url));
const attendanceReconcileSecret = process.env.ATTENDANCE_RECONCILE_SECRET ?? '';
const documentStorage = process.env.DOCUMENT_STORAGE ?? 'local';
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'dutytrace-documents';
const appUrl = process.env.APP_URL ?? clientOrigin;
const smtp = {
  host: process.env.SMTP_HOST ?? '',
  port: toInt(process.env.SMTP_PORT, 587, { max: 65535 }),
  secure: toBool(process.env.SMTP_SECURE),
  user: process.env.SMTP_USER ?? '',
  pass: process.env.SMTP_PASS ?? '',
  from: process.env.SMTP_FROM ?? '',
};

// Secret used to sign office QR payloads. There is no built-in default: you must set QR_SIGNING_SECRET
// (32+ characters). Only the automated tests, which run under `node --test`, use a throwaway value.
const underTest = Boolean(process.env.NODE_TEST_CONTEXT);
if (!underTest && !(qrSecret?.length >= 32)) {
  throw new Error('QR_SIGNING_SECRET must be set (32+ characters). See backend/.env.example.');
}

if (!underTest && nodeEnv === 'production') {
  if (!databaseUrl) throw new Error('DATABASE_URL must be set in production.');
  if (!databaseSsl) throw new Error('DATABASE_SSL=true is required in production.');
  if (trustProxy < 1) throw new Error('TRUST_PROXY must be set to 1 or greater in production.');
  if (!['local', 'supabase'].includes(documentStorage)) {
    throw new Error('DOCUMENT_STORAGE must be either supabase or local.');
  }
  if (documentStorage === 'local' && (!process.env.UPLOAD_DIR || !path.isAbsolute(uploadDir))) {
    throw new Error('UPLOAD_DIR must be an absolute path on durable private storage when DOCUMENT_STORAGE=local.');
  }
  if (documentStorage === 'supabase') {
    let storageOrigin;
    try { storageOrigin = new URL(supabaseUrl); } catch { throw new Error('SUPABASE_URL must be a valid HTTPS project URL.'); }
    if (storageOrigin.protocol !== 'https:' || storageOrigin.origin !== supabaseUrl || storageOrigin.username || storageOrigin.password) {
      throw new Error('SUPABASE_URL must be an HTTPS origin without a path or credentials.');
    }
    if (supabaseSecretKey.length < 20) throw new Error('SUPABASE_SECRET_KEY must be configured for private server-side document storage.');
    if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(supabaseStorageBucket)) {
      throw new Error('SUPABASE_STORAGE_BUCKET must be a valid bucket identifier.');
    }
  }
  if (attendanceReconcileSecret.length < 32) {
    throw new Error('ATTENDANCE_RECONCILE_SECRET must be set (32+ characters) in production.');
  }
  let origin;
  try { origin = new URL(clientOrigin); } catch { throw new Error('CLIENT_ORIGIN must be a valid HTTPS URL in production.'); }
  if (origin.protocol !== 'https:' || origin.origin !== clientOrigin || origin.username || origin.password) {
    throw new Error('CLIENT_ORIGIN must be an HTTPS origin without a path or credentials in production.');
  }
  let resetOrigin;
  try { resetOrigin = new URL(appUrl); } catch { throw new Error('APP_URL must be a valid HTTPS frontend origin in production.'); }
  if (resetOrigin.protocol !== 'https:' || resetOrigin.origin !== appUrl || appUrl !== clientOrigin) {
    throw new Error('APP_URL must exactly match CLIENT_ORIGIN so password reset links return to the approved frontend.');
  }
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from || /\.local(?:>|\s|$)/i.test(smtp.from)) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS, and a verified non-local SMTP_FROM are required in production for account recovery.');
  }
}

export const env = {
  nodeEnv,
  port: toInt(process.env.PORT, 4000, { max: 65535 }),
  clientOrigin,
  // Fallback timezone for month-based records. Each academic term stores its institution timezone.
  timezone: process.env.APP_TIMEZONE ?? 'UTC',

  databaseUrl,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  testDatabaseSsl: toBool(process.env.TEST_DATABASE_SSL),
  testDatabaseSslCa: process.env.TEST_DATABASE_SSL_CA,
  databaseSsl,
  databaseSslCa: process.env.DATABASE_SSL_CA, // optional path to a CA certificate
  databasePoolMax: toInt(process.env.DB_POOL_MAX, 10, { max: 50 }),

  sessionCookieName: 'dt_session',
  sessionHours: toInt(process.env.SESSION_HOURS, 8),
  // Behind a reverse proxy (Render, Fly, Nginx…) set TRUST_PROXY=1 so client IPs are correct.
  trustProxy,

  qrSecret: qrSecret || 'test-only-qr-secret-not-for-real-use-0000000000',
  // A completed session longer than this is NOT counted as hours and is flagged
  // for review (likely a forgotten time-out).
  maxSessionHours: toInt(process.env.MAX_SESSION_HOURS, 12, { max: 24 }),
  attendanceReconcileSecret,
  documentStorage,
  supabaseUrl,
  supabaseSecretKey,
  supabaseStorageBucket,
  appUrl,
  smtp,

  // Private document storage (Phase 5). Never served statically; files are only reachable through
  // authenticated, access-checked API routes. Keep this directory OUT of git and any web root.
  uploadDir,
  maxUploadBytes: toInt(process.env.MAX_UPLOAD_MB, 5, { max: 25 }) * 1024 * 1024,
  maxDocsPerRecord: toInt(process.env.MAX_DOCS_PER_RECORD, 10, { max: 50 }),

  loginRateLimitMax: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 20), // per IP per 15 min
  maxFailedLogins: toInt(process.env.MAX_FAILED_LOGINS, 5),
  lockoutMinutes: toInt(process.env.LOCKOUT_MINUTES, 15),
};

export const isProduction = nodeEnv === 'production';
