import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closePool, query } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";

after(async () => {
  await closePool();
});

test("a fresh database migrates; a second run applies nothing; a broken migration fails and records nothing", async () => {
  // 1. Fresh database migrates
  await query("drop schema if exists public cascade; create schema public;");
  const appliedFirst = await runMigrations();
  assert.ok(appliedFirst.length >= 5);

  const { rows } = await query("select version from public.schema_migrations order by version;");
  assert.deepEqual(
    rows.map((r) => r.version),
    appliedFirst,
  );

  // 2. Second run applies nothing
  const appliedSecond = await runMigrations();
  assert.deepEqual(appliedSecond, []);

  // 3. Broken migration in a temporary folder fails and records nothing
  const tempDir = mkdtempSync(join(tmpdir(), "migration-test-"));
  try {
    const brokenFile = "99999999999999_broken.sql";
    writeFileSync(join(tempDir, brokenFile), "THIS IS INVALID SQL;");

    await assert.rejects(
      async () => {
        await runMigrations({ migrationsDir: tempDir });
      },
      (err) => {
        assert.ok(
          err.message.includes(brokenFile),
          `Error message should name failed file: ${err.message}`,
        );
        return true;
      },
    );

    const { rows: afterBroken } = await query(
      "select version from public.schema_migrations where version = $1",
      [brokenFile],
    );
    assert.equal(afterBroken.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
