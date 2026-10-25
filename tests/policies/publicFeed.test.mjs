import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CHECK_VIOLATION,
  DENIED,
  adminClient,
  anonymousClient,
  assertDenied,
  assertOk,
  createUser,
} from "./helpers/clients.mjs";

function advisory(overrides = {}) {
  return {
    kind: "advisory",
    summary: `Road closed near the bridge ${randomUUID()}`,
    municipality: "Kalibo",
    ...overrides,
  };
}

async function publish(user, overrides) {
  const row = advisory(overrides);
  assertOk(await user.client.from("public_feed").insert(row));

  return assertOk(
    await user.client.from("public_feed").select("*").eq("summary", row.summary).single(),
  );
}

test("REQ-018: responders publish and unpublish their own advisories", async () => {
  const responder = await createUser("responder");
  const item = await publish(responder);

  assert.equal(item.created_by, responder.id);
  assert.equal(item.source, "tabang");
  assert.equal(
    assertOk(await anonymousClient().from("public_feed").select("id").eq("id", item.id)).length,
    1,
  );

  assertOk(
    await responder.client.from("public_feed").update({ published: false }).eq("id", item.id),
  );
  assert.deepEqual(
    assertOk(await anonymousClient().from("public_feed").select("id").eq("id", item.id)),
    [],
  );
  assert.equal(
    assertOk(await responder.client.from("public_feed").select("id").eq("id", item.id)).length,
    1,
    "the author still sees an unpublished item",
  );
});

test("REQ-009: public_feed writes are schema-checked", async () => {
  const responder = await createUser("responder");
  const other = await createUser("responder");
  const resident = await createUser();

  assertDenied(
    await responder.client.from("public_feed").insert(advisory({ summary: "x".repeat(241) })),
    { code: CHECK_VIOLATION },
  );
  assertDenied(await responder.client.from("public_feed").insert(advisory({ kind: "rumour" })), {
    code: CHECK_VIOLATION,
  });
  assertDenied(
    await responder.client.from("public_feed").insert(advisory({ created_by: other.id })),
    { code: DENIED },
  );
  assertDenied(
    await responder.client.from("public_feed").insert(advisory({ source: "dost-signal" })),
    { code: DENIED },
  );
  assertDenied(await resident.client.from("public_feed").insert(advisory()), { code: DENIED });
  assertDenied(await anonymousClient().from("public_feed").insert(advisory()), { code: DENIED });

  const item = await publish(responder);
  const update = await other.client
    .from("public_feed")
    .update({ summary: "Hijacked" })
    .eq("id", item.id)
    .select();
  assert.deepEqual(assertOk(update), [], "another responder's update matches no rows");
  assertDenied(
    await responder.client.from("public_feed").update({ source: "x" }).eq("id", item.id),
    { code: DENIED },
  );
});

test("reviewers unpublish any advisory but cannot rewrite it", async () => {
  const responder = await createUser("responder");
  const reviewer = await createUser("reviewer");
  const item = await publish(responder);

  assertDenied(
    await reviewer.client
      .from("public_feed")
      .update({ summary: "Rewritten", published: false })
      .eq("id", item.id),
    { message: /forbidden/ },
  );
  assertOk(
    await reviewer.client.from("public_feed").update({ published: false }).eq("id", item.id),
  );

  const stored = assertOk(
    await adminClient().from("public_feed").select("summary, published").eq("id", item.id).single(),
  );
  assert.deepEqual(stored, { summary: item.summary, published: false });
});

test("expired advisories are hidden", async () => {
  const responder = await createUser("responder");
  const item = await publish(responder, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });

  assert.deepEqual(
    assertOk(await anonymousClient().from("public_feed").select("id").eq("id", item.id)),
    [],
  );
});

test("REQ-009: signals and api_clients are unreachable from clients", async () => {
  const admin = await createUser("admin");
  const rows = {
    signals: {
      source: "x",
      external_id: randomUUID(),
      type: "other",
      headline: "x",
      issued_at: new Date().toISOString(),
    },
    api_clients: { name: "x", key_hash: "a".repeat(64), scopes: ["incidents:read"] },
  };

  for (const client of [anonymousClient(), admin.client]) {
    for (const [table, row] of Object.entries(rows)) {
      assertDenied(await client.from(table).select("*"), { code: DENIED });
      assertDenied(await client.from(table).insert(row), { code: DENIED });
    }

    assertDenied(
      await client.rpc("ingest_signal", {
        source: "x",
        external_id: "x",
        type: "other",
        level: null,
        headline: "x",
        body: null,
        areas: [],
        issued_at: new Date().toISOString(),
        expires_at: null,
        url: null,
      }),
    );
  }
});

test("ingest_signal is idempotent and publishes one advisory", async () => {
  const admin = adminClient();
  const signal = {
    source: "dost-signal",
    external_id: `TEST-${randomUUID()}`,
    type: "tropical-cyclone-wind-signal",
    level: "2",
    headline: "Signal No. 2 raised over Aklan",
    body: null,
    areas: [{ municipality: "Kalibo" }],
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    url: null,
  };

  const [first] = assertOk(await admin.rpc("ingest_signal", signal));
  const [second] = assertOk(
    await admin.rpc("ingest_signal", { ...signal, headline: "Signal No. 3 raised over Aklan" }),
  );

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.signal_id, second.signal_id);

  const items = assertOk(
    await anonymousClient()
      .from("public_feed")
      .select("summary, source, municipality, kind")
      .eq("signal_id", first.signal_id),
  );
  assert.deepEqual(items, [
    {
      summary: "Signal No. 3 raised over Aklan",
      source: "dost-signal",
      municipality: "Kalibo",
      kind: "advisory",
    },
  ]);
});