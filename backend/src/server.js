import { app } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const server = app.listen(env.port, () => {
  console.log(`DutyTrace API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Close cleanly on Ctrl+C / deploy restarts.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => closePool().finally(() => process.exit(0))));
}
