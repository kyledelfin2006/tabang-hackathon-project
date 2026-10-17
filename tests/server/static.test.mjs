import { strict as assert } from "node:assert";
import { test } from "node:test";
import { startTestServer } from "./testServer.mjs";

const FILES = {
  "index.html": "<main>Tabang fixture</main>",
  "assets/app.js": "export default 'asset';",
  "service-worker.js": "self.addEventListener('install', () => {});",
  "googlebf1b788405b1680b.html": "verification fixture",
};

test("serves the build and extensionless SPA routes with security headers", async (t) => {
  const { request } = await startTestServer(t, FILES);

  for (const path of ["/", "/index.html", "/app/reports"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.body, FILES["index.html"], path);
    assert.equal(response.headers["cache-control"], "no-store", path);
    assert.match(response.headers["content-security-policy"], /default-src 'self'/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
});

test("uses immutable caching for assets and no-store for the service worker", async (t) => {
  const { request } = await startTestServer(t, FILES);
  const asset = await request("/assets/app.js");
  const worker = await request("/service-worker.js");

  assert.equal(asset.status, 200);
  assert.equal(asset.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(asset.body, FILES["assets/app.js"]);
  assert.equal(worker.status, 200);
  assert.equal(worker.headers["cache-control"], "no-store");
});

test("serves the verification file from the build and never falls back to project files", async (t) => {
  const { request } = await startTestServer(t, FILES);
  const verification = await request("/googlebf1b788405b1680b.html");

  assert.equal(verification.status, 200);
  assert.equal(verification.body, FILES["googlebf1b788405b1680b.html"]);

  for (const path of ["/.env", "/.git/config", "/server.mjs", "/package.json", "/%2e%2e/.env"]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
  }
});

test("returns 400 for malformed URI encoding and does not SPA-fallback API paths", async (t) => {
  const { request } = await startTestServer(t, FILES);
  assert.equal((await request("/%E0%A4%A")).status, 400);

  const api = await request("/api/v1/unknown");
  assert.equal(api.status, 404);
  assert.equal(api.body, "Not found");
});

test("allows HEAD without returning a body", async (t) => {
  const { request } = await startTestServer(t, FILES);
  const response = await request("/", { method: "HEAD" });

  assert.equal(response.status, 200);
  assert.equal(response.body, "");
});
