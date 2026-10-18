import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env, isProduction } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import { MIN_PASSWORD_LENGTH } from '../../utils/password.js';
import * as auth from './auth.service.js';
import {
  requestReset,
  verifyResetToken,
  resetPassword,
  emailConfigured,
} from './password-reset.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
});

const resetSchema = z.object({
  token: z.string().min(1, 'Reset token is required.').max(200),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(200),
});
const verifyResetSchema = z.object({ token: z.string().min(1, 'Reset token is required.').max(200) });

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
});

export function authRoutes({ loginRateLimitMax = env.loginRateLimitMax } = {}) {
  const router = Router();

  // Slow down password guessing from a single IP.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait and try again.')),
  });

  // Rate limit reset requests: 5 per IP per 15 minutes (prevents abuse without revealing accounts).
  const resetRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.')),
  });

  // Rate limit token verification: 10 per IP per 15 min.
  const resetVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment.')),
  });

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body ?? {});
    const { token, user } = await auth.login({
      email, password, ip: req.ip, userAgent: req.get('user-agent'),
    });
    res.cookie(env.sessionCookieName, token, { ...cookieOptions(), maxAge: env.sessionHours * 3600 * 1000 });
    ok(res, { user });
  }));

  router.post('/logout', asyncHandler(async (req, res) => {
    await auth.logout({ token: req.sessionToken, user: req.user, ip: req.ip });
    res.clearCookie(env.sessionCookieName, cookieOptions());
    ok(res, { loggedOut: true });
  }));

  router.get('/me', requireAuth, (req, res) => ok(res, { user: req.user }));

  // ─── Forgot Password ────────────────────────────────────────────────────────
  // POST /api/auth/forgot-password
  // Always returns a generic 200 to prevent email enumeration.
  router.post('/forgot-password', resetRequestLimiter, asyncHandler(async (req, res) => {
    const { email } = parse(forgotSchema, req.body ?? {});
    const result = await requestReset({
      email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Generic response — never reveal whether the email exists.
    const response = {
      message: 'If an account exists for that email address, a reset link has been sent.',
      emailConfigured: emailConfigured(),
    };

    // In development only: expose the reset URL so devs can test without SMTP.
    if (!isProduction && result.devUrl) {
      response.devResetUrl = result.devUrl;
    }

    ok(res, response);
  }));

  // ─── Verify Token (GET - for preflight check on the reset page) ───────────
  // Verify tokens in the body so URL and proxy logs do not record bearer tokens.
  router.post('/reset-password/verify', resetVerifyLimiter, asyncHandler(async (req, res) => {
    const { token: rawToken } = parse(verifyResetSchema, req.body ?? {});
    const result = await verifyResetToken(rawToken);
    // Return the masked email so the UI can show "Resetting for u***@school.edu"
    const masked = result.email.replace(/^(.{2})(.+)(@.+)$/, (_, a, b, c) => a + '*'.repeat(Math.max(1, b.length)) + c);
    res.set('Cache-Control', 'no-store');
    ok(res, { valid: true, maskedEmail: masked });
  }));

  // ─── Reset Password ──────────────────────────────────────────────────────────
  // POST /api/auth/reset-password
  router.post('/reset-password', resetVerifyLimiter, asyncHandler(async (req, res) => {
    const { token, password } = parse(resetSchema, req.body ?? {});
    await resetPassword({
      rawToken: token,
      newPassword: password,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.set('Cache-Control', 'no-store');
    ok(res, { message: 'Your password has been changed. Please sign in with your new password.' });
  }));

  return router;
}
