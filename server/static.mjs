import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function within(root, path) {
  return path === root || path.startsWith(root + sep);
}

export function parseRequestTarget(target) {
  const queryIndex = target.indexOf("?");
  const rawPath = queryIndex < 0 ? target : target.slice(0, queryIndex);
  const search = queryIndex < 0 ? "" : target.slice(queryIndex);

  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return { error: 400 };
  }

  let pathname;

  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return { error: 400 };
  }

  if (pathname.includes("\\")) {
    return { error: 404 };
  }

  const segments = pathname.split("/");

  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) {
    return { error: 404 };
  }

  return { pathname, search };
}

function safeFilePath(root, pathname) {
  try {
    const realRoot = realpathSync(root);
    const candidate = resolve(realRoot, `.${pathname}`);

    if (!within(realRoot, candidate) || !existsSync(candidate)) {
      return null;
    }

    const realCandidate = realpathSync(candidate);
    return within(realRoot, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}

function sendFile(req, res, filePath, pathname) {
  const headers = {
    "Content-Type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
  };

  if (pathname.startsWith("/assets/")) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  } else if (filePath.endsWith(`${sep}index.html`) || pathname === "/service-worker.js") {
    headers["Cache-Control"] = "no-store";
  }

  res.writeHead(200, headers);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

function sendNotFound(res, method) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(method === "HEAD" ? undefined : "Not found");
}

export function serveStatic(req, res, { distRoot, pathname }) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    sendNotFound(res, req.method);
    return;
  }

  let filePath = safeFilePath(distRoot, pathname);

  if (filePath && statSync(filePath).isDirectory()) {
    filePath = safeFilePath(distRoot, join(pathname, "index.html"));
  }

  if (filePath && statSync(filePath).isFile()) {
    sendFile(req, res, filePath, pathname);
    return;
  }

  if (!extname(pathname)) {
    filePath = safeFilePath(distRoot, "/index.html");

    if (filePath && statSync(filePath).isFile()) {
      sendFile(req, res, filePath, "/index.html");
      return;
    }
  }

  sendNotFound(res, req.method);
}
