import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    // Small pool: each serverless instance handles one request at a time.
    pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export const query = (text, params) => getPool().query(text, params);

export async function one(text, params) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

export async function transaction(fn) {
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
  if (pool) { await pool.end(); pool = undefined; }
}
