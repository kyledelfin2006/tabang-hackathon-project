import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { projectRoot, smokePages } from "./helpers/legacy_inventory.mjs";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startServer() {
  const port = 8100 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Legacy server exited early.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return {
          baseUrl,
          child,
          stdout,
          stderr,
        };
      }
    } catch {
      // Keep polling until the server starts listening.
    }

    await wait(100);
  }

  child.kill();
  throw new Error(`Legacy server did not start in time.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function stopServer(child) {
  child.kill();
  await once(child, "exit");
}

test("legacy smoke pages return HTML with expected route markers", async () => {
  const server = await startServer();

  try {
    for (const page of smokePages) {
      const response = await fetch(`${server.baseUrl}${page.path}`);
      const body = await response.text();

      assert.equal(response.status, 200, `${page.name} should return HTTP 200`);
      assert.match(response.headers.get("content-type") || "", /text\/html/i, `${page.name} should return HTML`);

      for (const marker of page.mustInclude) {
        assert.ok(body.includes(marker), `${page.name} should include "${marker}"`);
      }
    }
  } finally {
    await stopServer(server.child);
  }
});
