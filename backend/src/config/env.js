// Central place for reading environment variables, so the rest of the code
// never touches process.env directly and defaults are visible in one file.
import { existsSync } from 'node:fs';
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

// Secret used to sign office QR payloads. There is no built-in default: you must set QR_SIGNING_SECRET
// (32+ characters). Only the automated tests, which run under `node --test`, use a throwaway value.
const underTest = Boolean(process.env.NODE_TEST_CONTEXT);
if (!underTest && !(process.env.QR_SIGNING_SECRET?.length >= 32)) {
  throw new Error('QR_SIGNING_SECRET must be set (32+ characters). See backend/.env.example.');
}

export const env = {
  nodeEnv,
  port: toInt(process.env.PORT, 4000, { max: 65535 }),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  // Fallback timezone for month-based records. Each academic term stores its institution timezone.
  timezone: process.env.APP_TIMEZONE ?? 'UTC',

  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  databaseSsl: toBool(process.env.DATABASE_SSL),
  databaseSslCa: process.env.DATABASE_SSL_CA, // optional path to a CA certificate

  sessionCookieName: 'dt_session',
  sessionHours: toInt(process.env.SESSION_HOURS, 8),
  // Behind a reverse proxy (Render, Fly, Nginx…) set TRUST_PROXY=1 so client IPs are correct.
  trustProxy: toInt(process.env.TRUST_PROXY, 0, { min: 0 }),

  qrSecret: process.env.QR_SIGNING_SECRET || 'test-only-qr-secret-not-for-real-use-0000000000',
  // A completed session longer than this is NOT counted as hours and is flagged
  // for review (likely a forgotten time-out).
  maxSessionHours: toInt(process.env.MAX_SESSION_HOURS, 12, { max: 24 }),

  // Private document storage (Phase 5). Never served statically; files are only reachable through
  // authenticated, access-checked API routes. Keep this directory OUT of git and any web root.
  uploadDir: process.env.UPLOAD_DIR ?? fileURLToPath(new URL('../../uploads/', import.meta.url)),
  maxUploadBytes: toInt(process.env.MAX_UPLOAD_MB, 5, { max: 25 }) * 1024 * 1024,
  maxDocsPerRecord: toInt(process.env.MAX_DOCS_PER_RECORD, 10, { max: 50 }),

  loginRateLimitMax: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 20), // per IP per 15 min
  maxFailedLogins: toInt(process.env.MAX_FAILED_LOGINS, 5),
  lockoutMinutes: toInt(process.env.LOCKOUT_MINUTES, 15),
};

export const isProduction = nodeEnv === 'production';
