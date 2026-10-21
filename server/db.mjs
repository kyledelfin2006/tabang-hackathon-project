import pg from "pg";

const { Pool } = pg;

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54329/tabang";

let pool = null;

export function getPool(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
  if (!connectionString) {
    return null;
  }
  if (!pool || pool._connectionString !== connectionString) {
    if (pool) {
      pool.end().catch(() => {});
    }
    pool = new Pool({ connectionString, idleTimeoutMillis: 1000 });
    pool._connectionString = connectionString;
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    const active = pool;
    pool = null;
    await active.end();
  }
}

export async function query(text, params) {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error("No database connection available (DATABASE_URL not set)");
  }
  return currentPool.query(text, params);
}

export async function withTransaction(fn, existingClient = null) {
  if (existingClient) {
    return fn(existingClient);
  }
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error("No database connection available (DATABASE_URL not set)");
  }
  const client = await currentPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}
