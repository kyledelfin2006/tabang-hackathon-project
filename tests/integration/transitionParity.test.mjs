import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_TRANSITIONS } from "../../src/services/incidents/incidentLifecycle.js";
import { closePool, query } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("incident_transitions matches ALLOWED_TRANSITIONS", async () => {
  const { rows } = await query("select from_status, to_status from public.incident_transitions");
  const fromDatabase = rows.map((row) => `${row.from_status}>${row.to_status}`).sort();
  const fromClient = Object.entries(ALLOWED_TRANSITIONS)
    .flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`))
    .sort();

  assert.deepEqual(fromDatabase, fromClient);
});
