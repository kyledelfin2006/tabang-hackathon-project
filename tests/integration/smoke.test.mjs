import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../server/testServer.mjs";
import { resetDatabase } from "./helpers/db.mjs";
import { createPostgresStore } from "../../server/store.mjs";

test("smoke: server responds to health, session, and public feeds", async (t) => {
  await resetDatabase();
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, { store });

  const health = await server.request("/api/v1/health");
  assert.equal(health.status, 200);
  const healthJson = JSON.parse(health.body);
  assert.equal(healthJson.status, "ok");

  const session = await server.request("/api/app/session");
  assert.equal(session.status, 200);
  const sessionJson = JSON.parse(session.body);
  assert.equal(sessionJson, null);

  const advisories = await server.request("/api/app/advisories");
  assert.equal(advisories.status, 200);
  assert.ok(Array.isArray(JSON.parse(advisories.body)));

  const hotlines = await server.request("/api/app/hotlines");
  assert.equal(hotlines.status, 200);
  assert.ok(Array.isArray(JSON.parse(hotlines.body)));
});
