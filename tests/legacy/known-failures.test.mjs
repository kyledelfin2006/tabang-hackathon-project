import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  collectBrokenLocalReferences,
  expectedMissingRefs,
  expectedServerFallbacks,
  projectRoot,
  serializeBrokenRefs,
} from "./helpers/legacy_inventory.mjs";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startServer() {
  const port = 8700 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("Legacy server exited before the known-failure checks could run.");
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return {
          baseUrl,
          child,
        };
      }
    } catch {
      // Retry until the server is listening.
    }

    await wait(100);
  }

  child.kill();
  throw new Error("Legacy server did not start in time for the known-failure checks.");
}

async function stopServer(child) {
  child.kill();
  await once(child, "exit");
}

test("expected missing module import remains recorded in the baseline", () => {
  const actual = serializeBrokenRefs(collectBrokenLocalReferences());
  const expected = serializeBrokenRefs(expectedMissingRefs);

  assert.deepEqual(actual, expected);
});

test("missing asset requests currently fall back to 404 HTML with HTTP 200", async () => {
  const server = await startServer();

  try {
    for (const entry of expectedServerFallbacks) {
      const response = await fetch(`${server.baseUrl}${entry.path}`);
      const body = await response.text();

      assert.equal(response.status, entry.expectedStatus, `${entry.path} should preserve the recorded fallback status`);
      assert.ok(body.includes(entry.expectedBodyIncludes), `${entry.path} should return the recorded fallback HTML body`);
    }
  } finally {
    await stopServer(server.child);
  }
});
