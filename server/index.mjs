import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applySecurityHeaders } from "./securityHeaders.mjs";
import { redirectLegacyUrl } from "./legacyRedirects.mjs";
import { parseRequestTarget, serveStatic } from "./static.mjs";
import {
  buildDestroyParams,
  buildIdentityUploadParams,
  buildSignedDeliveryUrl,
  buildSignedUploadParams,
  isReviewerRole,
  readCallerRole,
  signUploadParams,
  verifyFirebaseIdToken,
} from "../scripts/uploads/cloudinarySignature.mjs";

const SIGNATURE_ROUTE = "/api/uploads/cloudinary-signature";
const IDENTITY_SIGNATURE_ROUTE = "/api/uploads/identity-signature";
const IDENTITY_VIEW_ROUTE = "/api/uploads/identity-view";
const IDENTITY_DELETE_ROUTE = "/api/uploads/identity-delete";
const MAX_SIGNATURE_BODY_BYTES = 8 * 1024;


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
async function handleSignatureRequest(req, res, env) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const apiKey = env.FIREBASE_WEB_API_KEY;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

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

function uploadConfig(env) {
  return {
    apiKey: env.FIREBASE_WEB_API_KEY,
    projectId: env.FIREBASE_PROJECT_ID,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

/**
 * Signs an upload of government ID or selfie evidence.
 *
 * Uses Cloudinary's authenticated delivery type so the asset is not reachable
 * on the public URL space, and scopes the folder to the verified uid.
 */
async function handleIdentitySignatureRequest(req, res, env) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig(env);

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
async function handleIdentityViewRequest(req, res, env) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig(env);

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
async function handleIdentityDeleteRequest(req, res, env) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });

    return;
  }

  const config = uploadConfig(env);

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

export function createAppServer({ distRoot = resolve("dist"), env = process.env } = {}) {
  return createServer((req, res) => {
    applySecurityHeaders(res);
    const parsed = parseRequestTarget(req.url ?? "/");

    if (parsed.error) {
      res.writeHead(parsed.error, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }

    const { pathname, search } = parsed;
    const handlers = {
      [IDENTITY_DELETE_ROUTE]: handleIdentityDeleteRequest,
      [IDENTITY_SIGNATURE_ROUTE]: handleIdentitySignatureRequest,
      [IDENTITY_VIEW_ROUTE]: handleIdentityViewRequest,
      [SIGNATURE_ROUTE]: handleSignatureRequest,
    };
    const handler = handlers[pathname];

    if (handler) {
      handler(req, res, env).catch(() => {
        sendJson(res, 500, { error: "Unexpected server error." });
      });
      return;
    }

    if (redirectLegacyUrl(req, res, pathname, search)) {
      return;
    }

    serveStatic(req, res, { distRoot, pathname });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8000);

  createAppServer().listen(port, host, () => {
    console.log(`Tabang is running at http://${host}:${port}/`);
  });
}
