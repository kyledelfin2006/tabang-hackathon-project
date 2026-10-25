import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateClient, generateApiKey } from "../../server/auth.mjs";
import { createSupabaseStore } from "../../server/supabaseStore.mjs";
import { adminClient } from "./helpers/clients.mjs";

// The server's real store against the local database: provisioning, key
// checks, and revocation, as the partner API will use them.
test("REQ-033: api clients are created, authenticated, listed, and revoked", async () => {
  const store = createSupabaseStore(adminClient());
  const { id, key, keyHash } = generateApiKey();

  const created = await store.createApiClient({
    id,
    name: "Policy test partner",
    scopes: ["incidents:read"],
    keyHash,
  });

  assert.equal(created.status, "active");
  assert.equal(created.keyHash, keyHash);

  const authenticated = await authenticateClient(`Bearer ${key}`, {
    findClient: store.findApiClient,
  });
  assert.equal(authenticated.id, id);

  assert.ok((await store.listApiClients()).some((client) => client.id === id));
  assert.equal(await store.revokeApiClient(id), true);
  assert.equal(
    await authenticateClient(`Bearer ${key}`, { findClient: store.findApiClient }),
    null,
  );
});
