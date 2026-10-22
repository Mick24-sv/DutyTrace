import { app } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`DutyTrace API listening on port ${env.port} (${env.nodeEnv})`);
});

// Stop accepting traffic, drain active requests, then close PostgreSQL. Render
// sends SIGTERM during deploys; force-close stragglers after a bounded grace.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down gracefully.`);
    const timeout = setTimeout(() => server.closeAllConnections(), 10_000);
    timeout.unref();
    server.close((error) => {
      clearTimeout(timeout);
      if (error) console.error('HTTP server shutdown failed.', { code: error.code });
      closePool()
        .catch((poolError) => console.error('Database pool shutdown failed.', { code: poolError.code }))
        .finally(() => { process.exitCode = error ? 1 : 0; });
    });
  });
}
