import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env.js';

// PostgreSQL DATE values are calendar dates, not instants. The default pg
// parser turns them into local-midnight Date objects, which can shift a day
// when passed back to PostgreSQL from a process in another timezone.
pg.types.setTypeParser(1082, (value) => value);

// One shared connection pool. All queries use parameter placeholders ($1, $2…)
// so user input is never concatenated into SQL.

// Note: pg returns timestamptz as JS Date objects, which serialise to
// ISO-8601 UTC strings in JSON.

const buildSsl = () => {
  if (!env.databaseSsl) return undefined;
  const ca = env.databaseSslCa ? fs.readFileSync(env.databaseSslCa, 'utf8') : undefined;
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
};

let pool;

export const getPool = () => {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env.');
    }
    pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: buildSsl(),
      max: 10,
    });
  }
  return pool;
};

export const query = (text, params) => getPool().query(text, params);

// Holds a database-scoped advisory lock on one connection while work can use
// the shared pool; unlike an in-process mutex this coordinates Render instances.
export async function withAdvisoryLock(key, fn) {
  const client = await getPool().connect();
  let locked = false;
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [key]);
    locked = rows[0].locked;
    if (!locked) return { skipped: true, reason: 'already_running' };
    return await fn();
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
    client.release();
  }
}

// Run several statements atomically.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
