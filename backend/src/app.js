import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { buildRoutes } from './routes/index.js';
import { env } from './config/env.js';
import { loadSession, originCheck } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// The app is built here and started in server.js, so tests can import it
// without opening a port. `options` lets tests lower the login rate limit.
export function createApp(options = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(originCheck);
  app.use(loadSession);

  app.use('/api', buildRoutes(options));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
