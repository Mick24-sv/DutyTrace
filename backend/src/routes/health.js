import { Router } from 'express';
import { asyncHandler, ok } from '../utils/response.js';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

const router = Router();

// Liveness stays independent of PostgreSQL so the platform can distinguish an
// alive process from a ready API using the endpoint below.
router.get('/', (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'dutytrace-api',
    environment: env.nodeEnv,
    timezone: env.timezone,
    serverTime: new Date().toISOString(),
  });
});

// Render readiness check: unlike the liveness endpoint, this verifies that the
// API can reach PostgreSQL before traffic is sent to this instance.
router.get('/ready', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  ok(res, { status: 'ready', service: 'dutytrace-api' });
}));

export default router;
