import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool, query } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { authenticateClient, generateApiKey } from "../../server/auth.mjs";
import { startTestServer } from "../server/testServer.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-033: API clients provisioning, authentication, listing, and revocation in Postgres", async () => {
  const store = createPostgresStore();
  const { id, key, keyHash } = generateApiKey();

  const created = await store.createApiClient({
    id,
    name: "Integration Partner",
    scopes: ["incidents:read", "signals:write"],
    keyHash,
  });

  assert.equal(created.status, "active");
  assert.equal(created.keyHash, keyHash);

  const authenticated = await authenticateClient(`Bearer ${key}`, {
    findClient: store.findApiClient,
  });
  assert.equal(authenticated.id, id);

  const list = await store.listApiClients();
  assert.ok(list.some((c) => c.id === id));

  const revoked = await store.revokeApiClient(id);
  assert.equal(revoked, true);

  const afterRevoke = await authenticateClient(`Bearer ${key}`, {
    findClient: store.findApiClient,
  });
  assert.equal(afterRevoke, null);
});

test("REQ-014: health check reflects database liveness", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, { store });

  // 1. Database is healthy -> 200 { status: "ok" }
  const healthyRes = await server.request("/api/v1/health");
  assert.equal(healthyRes.status, 200);
  const healthyBody = JSON.parse(healthyRes.body);
  assert.equal(healthyBody.status, "ok");
  assert.ok(healthyBody.time);

  // 2. Broken store / ping throws -> 503 unavailable with error envelope and no DB detail
  const brokenStore = {
    ...store,
    ping: async () => {
      throw new Error("connection to server at '127.0.0.1', port 5432 failed");
    },
  };
  const failingServer = await startTestServer(t, {}, { store: brokenStore });
  const failedRes = await failingServer.request("/api/v1/health");
  assert.equal(failedRes.status, 503);
  const failedBody = JSON.parse(failedRes.body);
  assert.equal(failedBody.error.code, "unavailable");
  assert.equal(failedBody.error.message, "The database is unavailable.");
  assert.ok(failedBody.error.requestId);
  assert.equal(failedRes.body.includes("5432"), false, "No database details in response body");
});

test("REQ-015: partner API paging, projection with protected fields omitted, and signals ingestion", async (t) => {
  const store = createPostgresStore();
  const { id: partnerId, key, keyHash } = generateApiKey();

  await store.createApiClient({
    id: partnerId,
    name: "Partner End-to-End",
    scopes: ["incidents:read", "signals:write"],
    keyHash,
  });

  const server = await startTestServer(t, {}, { store });

  const authHeaders = {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };

  // Seed user and report with protected fields
  const userId = randomUUID();
  const reportId = randomUUID();
  await query("insert into public.users (id, email, password_hash) values ($1, $2, $3)", [
    userId,
    `partner-test-${userId}@example.com`,
    "hash",
  ]);
  await query(
    `insert into public.reports (
      id, reporter_id, kind, municipality, barangay, landmark,
      public_location_label, latitude, longitude, description,
      contact_phone, severity, need, people_affected
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      reportId,
      userId,
      "flood",
      "Kalibo",
      "Poblacion",
      "Top Secret Landmark",
      "Poblacion, Kalibo",
      11.7,
      122.36,
      "Private report details that must not leak",
      "09171234567",
      "waist",
      null,
      null,
    ],
  );

  // 1. Partner queries incidents -> protected fields are NOT present
  const incRes = await server.request("/api/v1/incidents?municipality=Kalibo", {
    headers: authHeaders,
  });
  assert.equal(incRes.status, 200);
  const incBody = JSON.parse(incRes.body);
  const incident = incBody.data.find((i) => i.id === reportId);
  assert.ok(incident);
  assert.equal(incident.kind, "flood");
  assert.equal(incident.municipality, "Kalibo");
  assert.equal(incident.barangay, "Poblacion");
  assert.equal(incident.description, undefined);
  assert.equal(incident.contact_phone, undefined);
  assert.equal(incident.contactPhone, undefined);
  assert.equal(incident.landmark, undefined);
  assert.equal(incident.latitude, undefined);
  assert.equal(incident.longitude, undefined);

  // 2. Partner ingests signal -> creates advisory in feed
  const externalId = `ext-${randomUUID()}`;
  const signalRes = await server.request("/api/v1/signals", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      source: "dost-pagasa",
      externalId,
      type: "flood-advisory",
      level: "red",
      headline: "Critical Flood Warning in Kalibo",
      body: "Immediate evacuation recommended.",
      areas: [{ municipality: "Kalibo" }],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      url: "https://example.com/warning",
    }),
  });
  assert.equal(signalRes.status, 201);

  // 3. Query public advisories -> ingested signal appears
  const advRes = await server.request("/api/v1/advisories");
  assert.equal(advRes.status, 200);
  const advBody = JSON.parse(advRes.body);
  const advisory = advBody.data.find((a) => a.summary.includes("Critical Flood Warning"));
  assert.ok(advisory);
  assert.equal(advisory.source, "dost-pagasa");
  assert.equal(advisory.municipality, "Kalibo");
});
