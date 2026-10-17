import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, hashKey } from "../../server/auth.mjs";
import { API_ROUTES } from "../../server/routes/index.mjs";
import { createMemoryStore } from "./memoryStore.mjs";
import { startTestServer } from "./testServer.mjs";

// A scoped route and a body route stand in for the partner endpoints, so the
// shared rules are tested once, here, rather than in every route's tests.
const TEST_ROUTES = [
  ...API_ROUTES,
  {
    method: "GET",
    path: "/api/v1/test/private",
    scope: "incidents:read",
    handler: ({ client }) => ({ body: { clientId: client.id } }),
  },
  {
    method: "POST",
    path: "/api/v1/test/echo",
    scope: "signals:write",
    handler: ({ body }) => ({ status: 201, body }),
  },
];

async function start(t, { env = {}, now } = {}) {
  const store = createMemoryStore();
  const lines = [];
  const server = await startTestServer(t, {}, {
    store,
    env,
    now,
    routes: TEST_ROUTES,
    log: (line) => lines.push(JSON.parse(line)),
  });

  return { ...server, store, lines };
}

function bearer(key) {
  return { Authorization: `Bearer ${key}` };
}

function envelope(response) {
  return JSON.parse(response.body).error;
}

test("GET /api/v1/health answers with a request id and no key", async (t) => {
  const { request } = await start(t);
  const response = await request("/api/v1/health");

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).status, "ok");
  assert.match(response.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("REQ-032: unknown routes and methods use the error envelope", async (t) => {
  const { request } = await start(t);
  const missing = await request("/api/v1/nothing-here");

  assert.equal(missing.status, 404);
  assert.deepEqual(Object.keys(envelope(missing)).sort(), ["code", "message", "requestId"]);
  assert.equal(envelope(missing).code, "not_found");
  assert.equal(envelope(missing).requestId, missing.headers["x-request-id"]);

  const wrongMethod = await request("/api/v1/health", { method: "DELETE" });

  assert.equal(wrongMethod.status, 405);
  assert.equal(envelope(wrongMethod).code, "method_not_allowed");
  assert.equal(wrongMethod.headers.allow, "GET");
});

test("REQ-033: a missing, malformed, or unknown key gets 401", async (t) => {
  const { request } = await start(t);
  const unknown = generateApiKey().key;

  for (const headers of [{}, { Authorization: "Bearer nope" }, bearer(unknown), { Authorization: unknown }]) {
    const response = await request("/api/v1/test/private", { headers });

    assert.equal(response.status, 401);
    assert.equal(envelope(response).code, "unauthorized");
  }
});

test("REQ-033: a revoked key gets 401 and a valid one is accepted", async (t) => {
  const { request, store } = await start(t);
  const { id, key } = await store.provision(["incidents:read"]);

  const accepted = await request("/api/v1/test/private", { headers: bearer(key) });
  assert.equal(accepted.status, 200);
  assert.equal(JSON.parse(accepted.body).clientId, id);

  await store.revokeApiClient(id);

  const revoked = await request("/api/v1/test/private", { headers: bearer(key) });
  assert.equal(revoked.status, 401);
});

test("REQ-033: a key with the wrong secret for a real client gets 401", async (t) => {
  const { request, store } = await start(t);
  const { id } = await store.provision(["incidents:read"]);
  const forged = `tbk_${id}_${"A".repeat(43)}`;

  assert.equal((await request("/api/v1/test/private", { headers: bearer(forged) })).status, 401);
});

test("REQ-033: a key without the route's scope gets 403", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const response = await request("/api/v1/test/private", { headers: bearer(key) });

  assert.equal(response.status, 403);
  assert.equal(envelope(response).code, "forbidden");
});

test("REQ-033: only the hash of a key is stored", async (t) => {
  const { store } = await start(t);
  const { id, key } = await store.provision(["incidents:read"]);
  const stored = await store.findApiClient(id);

  assert.equal(stored.keyHash, hashKey(key));
  assert.ok(!JSON.stringify(stored).includes(key.split("_").pop()));
});

test("REQ-033: exceeding the per-client limit gets 429", async (t) => {
  let clock = 0;
  const { request, store } = await start(t, {
    env: { API_RATE_LIMIT_PER_MINUTE: "3" },
    now: () => clock,
  });
  const { key } = await store.provision(["incidents:read"]);
  const statuses = [];

  for (let index = 0; index < 4; index += 1) {
    statuses.push((await request("/api/v1/test/private", { headers: bearer(key) })).status);
  }

  assert.deepEqual(statuses, [200, 200, 200, 429]);

  // A minute later the bucket has refilled.
  clock += 60_000;
  assert.equal((await request("/api/v1/test/private", { headers: bearer(key) })).status, 200);
});

test("REQ-033: public routes are limited per address", async (t) => {
  const { request } = await start(t, { env: { API_RATE_LIMIT_PER_MINUTE: "2" }, now: () => 0 });
  const statuses = [];

  for (let index = 0; index < 3; index += 1) {
    statuses.push((await request("/api/v1/health")).status);
  }

  assert.deepEqual(statuses, [200, 200, 429]);
});

test("REQ-032: oversized and non-JSON bodies are refused", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const headers = { ...bearer(key), "Content-Type": "application/json" };

  const ok = await request("/api/v1/test/echo", {
    method: "POST",
    headers,
    body: JSON.stringify({ hello: "world" }),
  });
  assert.equal(ok.status, 201);
  assert.deepEqual(JSON.parse(ok.body), { hello: "world" });

  const oversized = await request("/api/v1/test/echo", {
    method: "POST",
    headers,
    body: JSON.stringify({ padding: "x".repeat(9 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(envelope(oversized).code, "invalid_request");

  const notJson = await request("/api/v1/test/echo", {
    method: "POST",
    headers,
    body: "{not json",
  });
  assert.equal(notJson.status, 400);
  assert.equal(envelope(notJson).code, "invalid_request");

  const wrongType = await request("/api/v1/test/echo", {
    method: "POST",
    headers: { ...bearer(key), "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongType.status, 400);
});

test("REQ-033: every request is logged once, without keys or bodies", async (t) => {
  const { request, store, lines } = await start(t);
  const { id, key } = await store.provision(["incidents:read"]);

  await request("/api/v1/test/private", { headers: bearer(key) });
  await request("/api/v1/health");

  assert.equal(lines.length, 2);
  assert.deepEqual(Object.keys(lines[0]).sort(), [
    "clientId",
    "method",
    "ms",
    "path",
    "requestId",
    "status",
    "time",
  ]);
  assert.equal(lines[0].clientId, id);
  assert.equal(lines[0].status, 200);
  assert.ok(!JSON.stringify(lines).includes(key));
});

test("scoped routes answer 503 when the server has no database settings", async (t) => {
  const { request } = await startTestServer(t, {}, { routes: TEST_ROUTES, store: null });
  const response = await request("/api/v1/test/private", {
    headers: bearer(generateApiKey().key),
  });

  assert.equal(response.status, 503);
  assert.equal(envelope(response).code, "unavailable");
});
