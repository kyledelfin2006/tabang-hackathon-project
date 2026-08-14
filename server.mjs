import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(".");
const distRoot = resolve("dist");
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function getPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const fullPath = resolve(join(root, clean));
  return fullPath === root || fullPath.startsWith(root + sep) ? fullPath : null;
}

function getDistPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const fullPath = resolve(join(distRoot, clean));
  return fullPath === distRoot || fullPath.startsWith(distRoot + sep) ? fullPath : null;
}

function serveFile(res, filePath, status = 200) {
  res.writeHead(status, {
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

function serveNotFound(res) {
  const notFoundPage = join(root, "404.html");

  if (existsSync(notFoundPage)) {
    serveFile(res, notFoundPage, 404);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${host}:${port}`).pathname);
  const hasExtension = extname(pathname) !== "";
  const distIndex = join(distRoot, "index.html");
  const legacyLanding = join(root, "legacy-index.html");
  const distReady = existsSync(distIndex);
  let filePath = getPath(req.url);
  let distPath = getDistPath(req.url);

  if (!filePath || !distPath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (pathname === "/" && !distReady && existsSync(legacyLanding)) {
    serveFile(res, legacyLanding);
    return;
  }

  if (distReady && existsSync(distPath)) {
    if (statSync(distPath).isDirectory()) {
      distPath = join(distPath, "index.html");
    }

    if (existsSync(distPath)) {
      serveFile(res, distPath);
      return;
    }
  }

  if (existsSync(filePath)) {
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    if (existsSync(filePath)) {
      serveFile(res, filePath);
      return;
    }
  }

  if (distReady && !hasExtension) {
    serveFile(res, distIndex);
    return;
  }

  serveNotFound(res);
}).listen(port, host, () => {
  console.log(`Tabang is running at http://${host}:${port}/`);
});
