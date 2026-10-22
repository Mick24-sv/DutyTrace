import { env } from '../config/env.js';
import { getUserForToken } from '../modules/auth/auth.service.js';
import { AppError, asyncHandler } from '../utils/response.js';

// 1) Runs on every request: if a valid session cookie exists, attach req.user.
export const loadSession = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[env.sessionCookieName];
  req.sessionToken = token;
  req.user = (await getUserForToken(token)) ?? null;
  next();
});

// 2) Route guard: must be logged in.
export const requireAuth = (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in.'));
  return next();
};

// 3) Route guard: must be logged in AND have one of the listed roles.
//    Enforced here on the server; hiding buttons in the UI is only cosmetic.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in.'));
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.'));
  }
  return next();
};

// CSRF defence (together with SameSite=Lax cookies): browsers always send an
// Origin header on cross-site POST/PATCH/PUT/DELETE. If it is present and is
// not our own client, reject. Non-browser clients (tests, curl) send none.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const originCheck = (req, _res, next) => {
  const origin = req.headers.origin;
  if (!SAFE_METHODS.has(req.method)) {
    const hasSessionCookie = Boolean(req.cookies?.[env.sessionCookieName]);
    const originMissingForSession = env.nodeEnv === 'production' && hasSessionCookie && !origin;
    if (originMissingForSession || (origin && origin !== env.clientOrigin)) {
      return next(new AppError(403, 'BAD_ORIGIN', 'Request origin is not allowed.'));
    }
  }
  return next();
};
