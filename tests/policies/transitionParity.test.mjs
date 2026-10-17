import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_TRANSITIONS } from "../../src/services/incidents/incidentLifecycle.js";
import { anonymousClient, assertOk } from "./helpers/clients.mjs";

test("incident_transitions matches ALLOWED_TRANSITIONS", async () => {
  const rows = assertOk(
    await anonymousClient().from("incident_transitions").select("from_status, to_status"),
  );
  const fromDatabase = rows.map((row) => `${row.from_status}>${row.to_status}`).sort();
  const fromClient = Object.entries(ALLOWED_TRANSITIONS)
    .flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`))
    .sort();

  assert.deepEqual(fromDatabase, fromClient);
});
