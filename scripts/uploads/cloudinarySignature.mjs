import { createHash } from "node:crypto";

export const UPLOAD_FOLDER_PREFIX = "tabang/reports";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_FORMATS = Object.freeze(["jpg", "png", "webp"]);

/**
 * Builds the exact parameter set the client is permitted to upload with.
 *
 * The client supplies no signed values. The folder is derived from the verified
 * uid, so a signature issued to one account cannot be used to write into
 * another account's folder, and the size and format caps are enforced by
 * Cloudinary rather than trusted from the browser.
 */
export function buildSignedUploadParams({ uid, timestampSeconds }) {
  if (!uid || typeof uid !== "string") {
    throw new Error("A verified uid is required to sign an upload.");
  }

  return {
    folder: `${UPLOAD_FOLDER_PREFIX}/${uid}`,
    timestamp: timestampSeconds,
    // Cloudinary rejects anything outside these limits server-side.
    allowed_formats: ALLOWED_UPLOAD_FORMATS.join(","),
    max_bytes: MAX_UPLOAD_BYTES,
    // Never let an upload overwrite an existing asset.
    overwrite: "false",
    unique_filename: "true",
    invalidate: "true",
  };
}

export const IDENTITY_FOLDER_PREFIX = "tabang/responder-applications";

/**
 * Parameters for government ID and selfie evidence.
 *
 * `type: authenticated` keeps the asset off the public delivery URL space, so
 * it cannot be fetched by guessing a public id. Every view must go through a
 * signed URL minted by a reviewer-gated endpoint.
 *
 * This is a weaker boundary than Firebase Storage Rules, which would let the
 * database itself refuse the read. It depends on this server never minting a
 * delivery URL for a non-reviewer.
 */
export function buildIdentityUploadParams({ uid, timestampSeconds }) {
  if (!uid || typeof uid !== "string") {
    throw new Error("A verified uid is required to sign an upload.");
  }

  return {
    folder: `${IDENTITY_FOLDER_PREFIX}/${uid}`,
    timestamp: timestampSeconds,
    type: "authenticated",
    access_mode: "authenticated",
    allowed_formats: ALLOWED_UPLOAD_FORMATS.join(","),
    max_bytes: MAX_UPLOAD_BYTES,
    overwrite: "false",
    unique_filename: "true",
  };
}

/**
 * Builds a signed delivery URL for an authenticated asset.
 *
 * Cloudinary derives the signature from the public id and the API secret, so a
 * URL cannot be forged without the secret.
 */
export function buildSignedDeliveryUrl({ cloudName, publicId, apiSecret }) {
  if (!apiSecret) {
    throw new Error("CLOUDINARY_API_SECRET is not configured.");
  }

  const signature = createHash("sha1")
    .update(`${publicId}${apiSecret}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .slice(0, 8);

  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/authenticated/s--${signature}--/${publicId}`;
}

/**
 * Reads the caller's own role assignment through the Firestore REST API using
 * their ID token.
 *
 * The rules already allow an account to read its own assignment and allow no
 * client to write any assignment, so a role obtained this way is as trustworthy
 * as the document itself. This avoids adding the Admin SDK.
 */
export async function readCallerRole({
  uid,
  idToken,
  projectId,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/roleAssignments/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );

  if (!response.ok) {
    // Missing document or denied read both mean "no elevated role".
    return "resident";
  }

  const payload = await response.json();
  const role = payload?.fields?.role?.stringValue;

  return typeof role === "string" ? role : "resident";
}

export function isReviewerRole(role) {
  return role === "reviewer" || role === "admin";
}

/**
 * Parameters for destroying an authenticated asset.
 *
 * Identity evidence is deleted as soon as a decision is recorded, so the most
 * sensitive data in the system exists for the shortest time that still lets a
 * reviewer do their job.
 */
export function buildDestroyParams({ publicId, timestampSeconds }) {
  if (!publicId?.startsWith(IDENTITY_FOLDER_PREFIX)) {
    throw new Error("Only identity evidence may be destroyed by this path.");
  }

  return {
    public_id: publicId,
    timestamp: timestampSeconds,
    type: "authenticated",
    invalidate: "true",
  };
}

/**
 * Cloudinary signs the alphabetically sorted `key=value` parameter string with
 * the API secret appended. The secret never leaves the server.
 */
export function signUploadParams(params, apiSecret) {
  if (!apiSecret) {
    throw new Error("CLOUDINARY_API_SECRET is not configured.");
  }

  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1")
    .update(`${canonical}${apiSecret}`)
    .digest("hex");
}

/**
 * Verifies a Firebase ID token using Google's REST endpoint.
 *
 * This avoids adding the Admin SDK and works on the free tier. It is a network
 * call per signature request, which is acceptable at report-submission rates.
 */
export async function verifyFirebaseIdToken({ idToken, apiKey, fetchImpl = fetch }) {
  if (!idToken || typeof idToken !== "string") {
    return null;
  }

  if (!apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is not configured.");
  }

  const response = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const account = payload?.users?.[0];

  return account?.localId ? { uid: account.localId } : null;
}
