import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env.js';

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
