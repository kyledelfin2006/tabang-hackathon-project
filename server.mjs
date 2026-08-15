import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  buildDestroyParams,
  buildIdentityUploadParams,
  buildSignedDeliveryUrl,
  buildSignedUploadParams,
  isReviewerRole,
  readCallerRole,
  signUploadParams,
  verifyFirebaseIdToken,
} from "./scripts/uploads/cloudinarySignature.mjs";

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

const SIGNATURE_ROUTE = "/api/uploads/cloudinary-signature";
const IDENTITY_SIGNATURE_ROUTE = "/api/uploads/identity-signature";
const IDENTITY_VIEW_ROUTE = "/api/uploads/identity-view";
const IDENTITY_DELETE_ROUTE = "/api/uploads/identity-delete";
const MAX_SIGNATURE_BODY_BYTES = 8 * 1024;


/*
 * Browser security headers.
 *
 * The CSP is deliberately explicit about who may be contacted: Firebase for
 * auth and data, Cloudinary for uploads and signed delivery. Anything else is
 * refused, which limits where a script injected through a report description
 * could send data.
 *
 * Phase 14 retired the legacy pages, so 'unsafe-inline' for styles and the
 * CDN font origins are gone: nothing left in the application needs them.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.cloudinary.com https://identitytoolkit.googleapis.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // A flood report page has no business reading the camera or microphone, and
  // geolocation is requested only from the report form on this origin.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  "X-Frame-Options": "DENY",
};

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_SIGNATURE_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();

        return;
      }

      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Request body was not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Issues a short-lived Cloudinary upload signature to a verified account.
 *
 * The API secret stays in this process. The client cannot choose any signed
 * parameter, so it cannot widen the folder, size, or format it uploads with.
 */
async function handleSignatureRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !cloudName || !cloudinaryApiKey || !apiSecret) {
    // Fail closed: never fall back to an unsigned upload path.
    sendJson(res, 503, { error: "Uploads are not configured on this server." });

    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });

    return;
  }

  let account;

  try {
    account = await verifyFirebaseIdToken({ idToken: body.idToken, apiKey });
  } catch {
    sendJson(res, 503, { error: "Could not verify the session." });

    return;
  }

  if (!account) {
    sendJson(res, 401, { error: "Sign in before uploading." });

    return;
  }

  const params = buildSignedUploadParams({
    uid: account.uid,
    timestampSeconds: Math.floor(Date.now() / 1000),
  });

  sendJson(res, 200, {
    cloudName,
    apiKey: cloudinaryApiKey,
    params,
    signature: signUploadParams(params, apiSecret),
  });
}

function uploadConfig() {
  return {
    apiKey: process.env.FIREBASE_WEB_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

/**
 * Signs an upload of government ID or selfie evidence.
 *
 * Uses Cloudinary's authenticated delivery type so the asset is not reachable
 * on the public URL space, and scopes the folder to the verified uid.
 */
async function handleIdentitySignatureRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig();

  if (!config.apiKey || !config.cloudName || !config.cloudinaryApiKey || !config.apiSecret) {
    sendJson(res, 503, { error: "Uploads are not configured on this server." });

    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });

    return;
  }

  let account;

  try {
    account = await verifyFirebaseIdToken({
      idToken: body.idToken,
      apiKey: config.apiKey,
    });
  } catch {
    sendJson(res, 503, { error: "Could not verify the session." });

    return;
  }

  if (!account) {
    sendJson(res, 401, { error: "Sign in before uploading." });

    return;
  }

  const params = buildIdentityUploadParams({
    uid: account.uid,
    timestampSeconds: Math.floor(Date.now() / 1000),
  });

  sendJson(res, 200, {
    cloudName: config.cloudName,
    apiKey: config.cloudinaryApiKey,
    params,
    signature: signUploadParams(params, config.apiSecret),
  });
}

/**
 * Mints a signed delivery URL for identity evidence.
 *
 * Only an applicant viewing their own upload, or a reviewer, may obtain one.
 * The role is read from roleAssignments through Firestore, which no client can
 * write, rather than trusted from the request.
 */
async function handleIdentityViewRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig();

  if (!config.apiKey || !config.projectId || !config.cloudName || !config.apiSecret) {
    sendJson(res, 503, { error: "Uploads are not configured on this server." });

    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });

    return;
  }

  const publicId = typeof body.publicId === "string" ? body.publicId : "";

  if (!publicId.startsWith("tabang/responder-applications/")) {
    sendJson(res, 400, { error: "That asset is not identity evidence." });

    return;
  }

  let account;

  try {
    account = await verifyFirebaseIdToken({
      idToken: body.idToken,
      apiKey: config.apiKey,
    });
  } catch {
    sendJson(res, 503, { error: "Could not verify the session." });

    return;
  }

  if (!account) {
    sendJson(res, 401, { error: "Sign in first." });

    return;
  }

  const ownsAsset = publicId.startsWith(
    `tabang/responder-applications/${account.uid}/`,
  );
  const role = await readCallerRole({
    uid: account.uid,
    idToken: body.idToken,
    projectId: config.projectId,
  });

  if (!ownsAsset && !isReviewerRole(role)) {
    sendJson(res, 403, { error: "Only a reviewer can open this evidence." });

    return;
  }

  sendJson(res, 200, {
    url: buildSignedDeliveryUrl({
      cloudName: config.cloudName,
      publicId,
      apiSecret: config.apiSecret,
    }),
  });
}

/**
 * Destroys identity evidence once a decision has been recorded.
 *
 * Reviewer-only: an applicant must not be able to erase the evidence a
 * reviewer is about to judge, and nobody else should be able to destroy it at
 * all.
 */
async function handleIdentityDeleteRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig();

  if (!config.apiKey || !config.projectId || !config.cloudName || !config.apiSecret) {
    sendJson(res, 503, { error: "Uploads are not configured on this server." });

    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });

    return;
  }

  let account;

  try {
    account = await verifyFirebaseIdToken({
      idToken: body.idToken,
      apiKey: config.apiKey,
    });
  } catch {
    sendJson(res, 503, { error: "Could not verify the session." });

    return;
  }

  if (!account) {
    sendJson(res, 401, { error: "Sign in first." });

    return;
  }

  const role = await readCallerRole({
    uid: account.uid,
    idToken: body.idToken,
    projectId: config.projectId,
  });

  if (!isReviewerRole(role)) {
    sendJson(res, 403, { error: "Only a reviewer can delete evidence." });

    return;
  }

  let params;

  try {
    params = buildDestroyParams({
      publicId: body.publicId,
      timestampSeconds: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });

    return;
  }

  const form = new URLSearchParams({
    ...params,
    api_key: config.cloudinaryApiKey,
    signature: signUploadParams(params, config.apiSecret),
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
  );

  if (!response.ok) {
    sendJson(res, 502, { error: "The evidence could not be deleted." });

    return;
  }

  sendJson(res, 200, { deleted: true });
}

createServer((req, res) => {
  applySecurityHeaders(res);

  const pathname = decodeURIComponent(new URL(req.url, `http://${host}:${port}`).pathname);

  if (pathname === IDENTITY_DELETE_ROUTE) {
    handleIdentityDeleteRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "Unexpected server error." });
    });

    return;
  }

  if (pathname === IDENTITY_SIGNATURE_ROUTE) {
    handleIdentitySignatureRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "Unexpected server error." });
    });

    return;
  }

  if (pathname === IDENTITY_VIEW_ROUTE) {
    handleIdentityViewRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "Unexpected server error." });
    });

    return;
  }

  if (pathname === SIGNATURE_ROUTE) {
    handleSignatureRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "Unexpected server error." });
    });

    return;
  }
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
