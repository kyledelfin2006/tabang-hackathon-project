import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateApiKey } from "../../server/auth.mjs";
import { createAppServer } from "../../server/index.mjs";
import { createSupabaseStore } from "../../server/store.mjs";
import { adminClient, createUser, fileReport } from "./helpers/clients.mjs";
import { loadLocalEnv } from "./helpers/env.mjs";

// The partner API end to end: the real server, its real store, and the local
// database, called over HTTP with a provisioned key.
async function startApi(t, scopes) {
  const { url, secretKey } = loadLocalEnv();
  const store = createSupabaseStore(adminClient());
  const { id, key, keyHash } = generateApiKey();

  await store.createApiClient({ id, name: "Partner API test", scopes, keyHash });

  const server = createAppServer({
    distRoot: ".",
    env: { SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey },
    log: () => {},
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;

  return (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
}

test("REQ-034: partners page through incidents without personal data", async (t) => {
  const api = await startApi(t, ["incidents:read"]);
  const resident = await createUser();
  const since = new Date(Date.now() - 1000).toISOString();
  const filed = [];

  for (let index = 0; index < 3; index += 1) {
    filed.push(await fileReport(resident, { municipality: "Buruanga", landmark: "Secret landmark" }));
  }

  const seen = [];
  let cursor = null;

  do {
    const query = new URLSearchParams({ since, municipality: "Buruanga", limit: "2" });

    if (cursor) {
      query.set("cursor", cursor);
    }

    const response = await api(`/api/v1/incidents?${query}`);
    assert.equal(response.status, 200);

    const page = await response.json();
    seen.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);

  assert.deepEqual(seen.map((incident) => incident.id).sort(), [...filed].sort());

  const text = JSON.stringify(seen);

  for (const secret of ["09171234567", "Water is knee deep", "Secret landmark", resident.id, "11.7"]) {
    assert.ok(!text.includes(secret), secret);
  }

  const one = await (await api(`/api/v1/incidents/${filed[0]}`)).json();
  assert.equal(one.data.municipality, "Buruanga");
  assert.equal(one.data.incidentStatus, "new");
});

test("REQ-035: signals publish one advisory and expired ones stay hidden", async (t) => {
  const api = await startApi(t, ["signals:write"]);
  const externalId = `POLICY-${randomUUID()}`;
  const signal = {
    source: "dost-signal",
    externalId,
    type: "rainfall-warning",
    headline: `Orange rainfall warning ${externalId}`,
    areas: [{ municipality: "Kalibo" }, { municipality: "Numancia" }],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };

  const first = await api("/api/v1/signals", { method: "POST", body: JSON.stringify(signal) });
  const again = await api("/api/v1/signals", { method: "POST", body: JSON.stringify(signal) });

  assert.equal(first.status, 201);
  assert.equal(again.status, 200);

  const expired = await api("/api/v1/signals", {
    method: "POST",
    body: JSON.stringify({
      ...signal,
      externalId: `${externalId}-old`,
      headline: `Old warning ${externalId}`,
      issuedAt: "2020-01-01T00:00:00+08:00",
      expiresAt: "2020-01-02T00:00:00+08:00",
    }),
  });
  assert.equal(expired.status, 201);

  const listed = await (await fetch(new URL("/api/v1/advisories?limit=100", first.url))).json();
  const mine = listed.data.filter((item) => item.summary.includes(externalId));

  assert.equal(mine.length, 1);
  assert.equal(mine[0].summary, signal.headline);
  assert.equal(mine[0].source, "dost-signal");
  assert.equal(mine[0].municipality, null, "two municipalities means no single one");
});
