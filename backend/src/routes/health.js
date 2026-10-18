import { Router } from 'express';
import { ok } from '../utils/response.js';
import { env } from '../config/env.js';

const router = Router();

// Simple liveness check. It intentionally does not touch the database yet;
// a database check will be added in Phase 2.
router.get('/', (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'dutytrace-api',
    environment: env.nodeEnv,
    timezone: env.timezone,
    serverTime: new Date().toISOString(),
  });
});

export default router;
