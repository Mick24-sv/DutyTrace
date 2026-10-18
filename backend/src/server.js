import { app } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { runReminderSweep } from './modules/notifications/reminders.service.js';

const server = app.listen(env.port, () => {
  console.log(`DutyTrace API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

const sweepReminders = () => runReminderSweep().catch((err) => {
  console.error('Notification reminder sweep failed:', err.message);
});
// Run after startup and then at the configured interval; work runs independently of requests.
const reminderTimer = setInterval(sweepReminders, env.reminderIntervalMinutes * 60_000);
reminderTimer.unref();
setImmediate(sweepReminders);

// Close cleanly on Ctrl+C / deploy restarts.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(reminderTimer);
    server.close(() => closePool().finally(() => process.exit(0)));
  });
}
