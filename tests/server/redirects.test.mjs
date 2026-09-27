import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LEGACY_REDIRECTS } from "../../server/legacyRedirects.mjs";
import { startTestServer } from "./testServer.mjs";

const urlMapPath = fileURLToPath(new URL("../../docs/legacy-url-map.md", import.meta.url));
const urlMap = readFileSync(urlMapPath, "utf8");
const documentedRedirects = Object.fromEntries(
  [...urlMap.matchAll(/^\|\s*`(\/[^`]+)`\s*\|\s*`([^`]+)`/gm)].map(([, path, target]) => [path, target]),
);

test("redirect map matches the documentation and every legacy URL returns a 301", async (t) => {
  assert.deepEqual(LEGACY_REDIRECTS, documentedRedirects);
  const { request } = await startTestServer(t, { "index.html": "fixture" });

  for (const [path, target] of Object.entries(LEGACY_REDIRECTS)) {
    const response = await request(`${path}?from=legacy`);
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.location, `${target}?from=legacy`, path);
  }
});
