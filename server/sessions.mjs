import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

// Precomputed dummy hash for timing protection on unknown emails
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_KEY = scryptSync("dummy-password", DUMMY_SALT, SCRYPT_KEYLEN).toString("hex");
const DUMMY_HASH = `${DUMMY_SALT}:${DUMMY_KEY}`;

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) {
    return false;
  }
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN);
  const storedBuffer = Buffer.from(key, "hex");
  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }
  return timingSafeEqual(derivedKey, storedBuffer);
}

export function dummyVerifyPassword(password) {
  verifyPassword(password || "", DUMMY_HASH);
}

export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseSessionCookie(req) {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...val] = cookie.split("=");
    if (name === "tabang_session") {
      return decodeURIComponent(val.join("="));
    }
  }
  return null;
}

export function serializeSessionCookie(token, { secure = false, expiresAt = null } = {}) {
  const expires = expiresAt instanceof Date ? `; Expires=${expiresAt.toUTCString()}` : "";
  return `tabang_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${
    secure ? "; Secure" : ""
  }${expires}`;
}

export function serializeClearSessionCookie({ secure = false } = {}) {
  return `tabang_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    secure ? "; Secure" : ""
  }; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
