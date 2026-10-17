import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLocalEnv } from "./helpers/env.mjs";

// Proves the local stack is up before any policy test is trusted: a failure
// here means Docker or `npm run db:start`, not a policy, is the problem.
const { url, publishableKey } = loadLocalEnv();

test("local auth answers", async () => {
  const response = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: publishableKey },
  });

  assert.equal(response.status, 200);
});

test("local data API answers", async () => {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: publishableKey, Accept: "application/openapi+json" },
  });

  assert.equal(response.status, 200);
});
