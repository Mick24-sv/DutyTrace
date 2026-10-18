import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env, isProduction } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse } from '../../utils/validate.js';
import * as auth from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const cookieOptions = () => ({
  httpOnly: true,          // JavaScript cannot read it (limits damage from XSS)
  secure: isProduction,    // HTTPS only in production
  sameSite: 'lax',         // not sent on cross-site POSTs (CSRF defence)
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

  return router;
}
