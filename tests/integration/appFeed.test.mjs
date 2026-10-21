import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { startTestServer } from "../server/testServer.mjs";
import { createApiClient, createSignedInUser } from "./helpers/appClient.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-007: public feed, responder publishing, unpublishing, and author visibility", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident = await createSignedInUser(server, { role: "resident" });
  const responder = await createSignedInUser(server, { role: "responder" });
  const anon = createApiClient(server);

  const summary = `Road impassable near river bridge ${randomUUID()}`;

  // 1. Resident cannot publish advisory -> 403 forbidden
  const residentPublish = await resident.client.post("/api/app/advisories", {
    summary,
    municipality: "Kalibo",
    barangay: "Poblacion",
  });
  assert.equal(residentPublish.status, 403);

  // 2. Summary validation (> 240 chars) -> 400 invalid_request
  const tooLong = await responder.client.post("/api/app/advisories", {
    summary: "A".repeat(241),
    municipality: "Kalibo",
  });
  assert.equal(tooLong.status, 400);

  // 3. Responder publishes valid advisory
  const publishRes = await responder.client.post("/api/app/advisories", {
    summary,
    municipality: "Kalibo",
    barangay: "Poblacion",
  });
  assert.equal(publishRes.status, 200);

  // 4. Anonymous visitor sees the advisory in public feed
  const publicFeedRes = await anon.get("/api/app/advisories");
  assert.equal(publicFeedRes.status, 200);
  const found = publicFeedRes.body.find((item) => item.summary === summary);
  assert.ok(found);
  assert.equal(found.source, "tabang");
  assert.equal(found.kind, "advisory");
  assert.equal(found.municipality, "Kalibo");

  // 5. Author unpublishes the advisory
  const unpublishRes = await responder.client.post(`/api/app/advisories/${found.id}/unpublish`);
  assert.equal(unpublishRes.status, 200);

  // 6. Anonymous visitor no longer sees the unpublished advisory
  const publicAfter = await anon.get("/api/app/advisories");
  assert.equal(publicAfter.status, 200);
  assert.equal(publicAfter.body.some((item) => item.id === found.id), false);

  // 7. Author still sees the unpublished advisory in /api/app/advisories/mine
  const ownRes = await responder.client.get("/api/app/advisories/mine");
  assert.equal(ownRes.status, 200);
  const ownItem = ownRes.body.find((item) => item.id === found.id);
  assert.ok(ownItem);
  assert.equal(ownItem.published, false);
});
