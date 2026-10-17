import { request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppServer } from "../../server/index.mjs";

export async function startTestServer(t, files = {}, options = {}) {
  const distRoot = mkdtempSync(join(tmpdir(), "tabang-server-"));

  for (const [path, body] of Object.entries(files)) {
    const filePath = join(distRoot, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, body);
  }

  const server = createAppServer({ distRoot, env: {}, log: () => {}, ...options });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(distRoot, { recursive: true, force: true });
  });

  const { port } = server.address();

  return {
    request(path, { method = "GET", headers = {}, body } = {}) {
      return new Promise((resolve, reject) => {
        const req = httpRequest(
          { hostname: "127.0.0.1", port, path, method, headers, agent: false },
          (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
          },
        );

        req.on("error", reject);
        req.end(body);
      });
    },
  };
}
