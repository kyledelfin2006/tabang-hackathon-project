import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ContractPendingError,
  toCanonicalSignal,
  verifyRequest,
} from "../../server/integrations/dostSignal.mjs";
import { validateCanonicalSignal } from "../../server/signals/canonicalSignal.mjs";
import { createMemoryStore } from "./memoryStore.mjs";
import { startTestServer } from "./testServer.mjs";

async function start(t) {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, { store });

  return { ...server, store };
}

function bearer(key) {
  return { Authorization: `Bearer ${key}` };
}

function json(response) {
  return JSON.parse(response.body);
}

// An incident row as the store could return it, including protected fields
// that must never reach a partner.
function incidentRow(index, overrides = {}) {
  const at = new Date(Date.UTC(2026, 9, 17, 0, index)).toISOString();

  return {
    id: randomUUID(),
    kind: "flood",
    incidentStatus: "new",
    verificationStatus: "pending",
    severity: "knee",
    need: null,
    peopleAffected: null,
    municipality: "Kalibo",
    barangay: "Poblacion",
    createdAt: at,
    updatedAt: at,
    acknowledgedAt: null,
    resolvedAt: null,
    contactPhone: "09171234567",
    description: "Private description with a house number.",
    latitude: 11.7,
    longitude: 122.37,
    landmark: "Beside the blue gate",
    reporterId: randomUUID(),
    imagePaths: ["a/b/c.jpg"],
    ...overrides,
  };
}

const validSignal = {
  source: "dost-signal",
  externalId: "TCWS-2026-TEST-001",
  type: "tropical-cyclone-wind-signal",
  level: "2",
  headline: "Signal No. 2 raised over Aklan",
  areas: [{ municipality: "Kalibo" }],
  issuedAt: "2026-10-01T08:00:00+08:00",
  expiresAt: "2099-10-02T08:00:00+08:00",
};

test("REQ-034: the partner projection never carries protected fields", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["incidents:read"]);
  const row = incidentRow(1);

  store.incidents.push(row);

  const list = json(await request("/api/v1/incidents", { headers: bearer(key) }));
  const one = json(await request(`/api/v1/incidents/${row.id}`, { headers: bearer(key) }));

  for (const incident of [list.data[0], one.data]) {
    assert.deepEqual(Object.keys(incident).sort(), [
      "acknowledgedAt",
      "barangay",
      "createdAt",
      "id",
      "incidentStatus",
      "kind",
      "municipality",
      "need",
      "peopleAffected",
      "resolvedAt",
      "severity",
      "updatedAt",
      "verificationStatus",
    ]);

    const text = JSON.stringify(incident);

    for (const secret of ["09171234567", "Private description", "11.7", "blue gate", row.reporterId, "c.jpg"]) {
      assert.ok(!text.includes(secret), secret);
    }
  }
});

test("REQ-034: cursor paging reaches all 30 incidents exactly once", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["incidents:read"]);

  for (let index = 0; index < 30; index += 1) {
    // Pairs share a timestamp, so ordering must fall back to the id.
    store.incidents.push(incidentRow(Math.floor(index / 2)));
  }

  const seen = [];
  let cursor = null;
  let pages = 0;

  do {
    const path = `/api/v1/incidents?limit=7${cursor ? `&cursor=${cursor}` : ""}`;
    const page = json(await request(path, { headers: bearer(key) }));

    seen.push(...page.data.map((incident) => incident.id));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor);

  assert.equal(pages, 5);
  assert.equal(seen.length, 30);
  assert.equal(new Set(seen).size, 30);
});

test("REQ-034: since, status, kind, and municipality filter the list", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["incidents:read"]);

  store.incidents.push(
    incidentRow(1),
    incidentRow(5, { kind: "help", severity: null, need: "rescue", peopleAffected: 3 }),
    incidentRow(9, { municipality: "Numancia" }),
    incidentRow(12, { incidentStatus: "resolved" }),
  );

  const ids = async (query) =>
    json(await request(`/api/v1/incidents?${query}`, { headers: bearer(key) })).data.map(
      (incident) => incident.updatedAt,
    );

  assert.equal((await ids("since=2026-10-17T00:05:00Z")).length, 2);
  assert.equal((await ids("kind=help")).length, 1);
  assert.equal((await ids("municipality=Numancia")).length, 1);
  assert.equal((await ids("status=resolved")).length, 1);
  assert.equal((await ids("")).length, 3, "the default is open incidents");

  for (const bad of ["since=yesterday", "kind=fire", "municipality=Manila", "status=lost", "limit=0", "limit=101", "cursor=abc"]) {
    const response = await request(`/api/v1/incidents?${bad}`, { headers: bearer(key) });

    assert.equal(response.status, 400, bad);
    assert.equal(json(response).error.code, "invalid_request");
  }
});

test("REQ-034: an unknown or malformed incident id is 404", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["incidents:read"]);

  for (const id of [randomUUID(), "not-an-id"]) {
    const response = await request(`/api/v1/incidents/${id}`, { headers: bearer(key) });

    assert.equal(response.status, 404);
  }
});

test("REQ-035: a signal is published as one advisory, however often it is sent", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const headers = { ...bearer(key), "Content-Type": "application/json" };

  const first = await request("/api/v1/signals", {
    method: "POST",
    headers,
    body: JSON.stringify(validSignal),
  });
  const repeat = await request("/api/v1/signals", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...validSignal, headline: "Signal No. 3 raised over Aklan" }),
  });

  assert.equal(first.status, 201);
  assert.equal(repeat.status, 200);
  assert.equal(json(first).data.id, json(repeat).data.id);

  const advisories = json(await request("/api/v1/advisories")).data;

  assert.equal(advisories.length, 1);
  assert.deepEqual(
    {
      summary: advisories[0].summary,
      source: advisories[0].source,
      municipality: advisories[0].municipality,
    },
    { summary: "Signal No. 3 raised over Aklan", source: "dost-signal", municipality: "Kalibo" },
  );
});

test("REQ-035: invalid signals are refused with the fields named", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const headers = { ...bearer(key), "Content-Type": "application/json" };
  const cases = {
    headline: { headline: "" },
    type: { type: "earthquake" },
    "areas[0]": { areas: [{ municipality: "Quezon City" }] },
    areas: { areas: [] },
    issuedAt: { issuedAt: "yesterday" },
    expiresAt: { expiresAt: "2026-09-01T08:00:00+08:00" },
    url: { url: "http://example.test" },
    source: { source: "DOST Signal!" },
  };

  for (const [field, change] of Object.entries(cases)) {
    const response = await request("/api/v1/signals", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...validSignal, ...change }),
    });

    assert.equal(response.status, 400, field);
    assert.match(json(response).error.message, new RegExp(field.replace(/[[\]]/g, "\\$&")));
  }

  assert.equal(store.signals.size, 0);
});

test("REQ-035: expired advisories are hidden from the public list", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const headers = { ...bearer(key), "Content-Type": "application/json" };

  await request("/api/v1/signals", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...validSignal,
      externalId: "OLD",
      issuedAt: "2020-01-01T00:00:00+08:00",
      expiresAt: "2020-01-02T00:00:00+08:00",
    }),
  });

  const response = await request("/api/v1/advisories");

  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.deepEqual(json(response).data, []);
});

test("REQ-036: the DOST route answers 501 until the contract is known", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["signals:write"]);
  const fixture = readFileSync("tests/server/fixtures/dost-signal/synthetic-wind-signal.json", "utf8");

  const response = await request("/api/v1/integrations/dost-signal", {
    method: "POST",
    headers: { ...bearer(key), "Content-Type": "application/json" },
    body: fixture,
  });

  assert.equal(response.status, 501);
  assert.equal(json(response).error.code, "not_implemented");
  assert.throws(() => toCanonicalSignal(JSON.parse(fixture)), ContractPendingError);
  assert.throws(() => verifyRequest({}, fixture, "secret"), ContractPendingError);
});

test("the canonical validator accepts a complete signal and normalizes it", () => {
  const { value, errors } = validateCanonicalSignal({
    ...validSignal,
    headline: "  Signal No. 2 raised over Aklan ",
    areas: [{ municipality: "Kalibo", barangay: " Poblacion " }],
  });

  assert.equal(errors, undefined);
  assert.equal(value.headline, "Signal No. 2 raised over Aklan");
  assert.deepEqual(value.areas, [{ municipality: "Kalibo", barangay: "Poblacion" }]);
  assert.equal(value.body, null);
});

test("partner routes need the right scope", async (t) => {
  const { request, store } = await start(t);
  const { key } = await store.provision(["incidents:read"]);

  const response = await request("/api/v1/signals", {
    method: "POST",
    headers: { ...bearer(key), "Content-Type": "application/json" },
    body: JSON.stringify(validSignal),
  });

  assert.equal(response.status, 403);
  assert.equal((await request("/api/v1/incidents")).status, 401);
});
