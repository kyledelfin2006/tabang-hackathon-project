import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPool } from "../db.mjs";
import { runMigrations } from "./migrate.mjs";

export async function resetDatabase({ databaseUrl = process.env.DATABASE_URL } = {}) {
  const pool = getPool(databaseUrl);
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  await pool.query("drop schema if exists public cascade; create schema public;");
  return runMigrations({ databaseUrl });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  resetDatabase()
    .then((applied) => {
      console.log(`Database reset. Applied ${applied.length} migration(s).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
