import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getPool, withTransaction } from "../db.mjs";

export async function runMigrations({
  migrationsDir = resolve("db/migrations"),
  databaseUrl = process.env.DATABASE_URL,
} = {}) {
  const pool = getPool(databaseUrl);
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  await pool.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await pool.query(`
    select version from public.schema_migrations order by version;
  `);
  const applied = new Set(rows.map((r) => r.version));

  let files;
  try {
    files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const appliedNow = [];

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, "utf8");

    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (version) values ($1)", [file]);
      });
      appliedNow.push(file);
    } catch (err) {
      const message = `Migration failed in ${file}: ${err.message}`;
      const migrationError = new Error(message);
      migrationError.file = file;
      migrationError.cause = err;
      throw migrationError;
    }
  }

  return appliedNow;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMigrations()
    .then((applied) => {
      if (applied.length > 0) {
        console.log(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
      } else {
        console.log("No pending migrations.");
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
