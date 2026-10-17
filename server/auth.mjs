import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

// tbk_<client id>_<secret>: the id finds the record, the secret proves the key.
const KEY_PATTERN = /^tbk_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/;

export function hashKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Makes a new partner key. Only the hash is ever stored; the key itself is
 * shown once to whoever provisions the client.
 */
export function generateApiKey() {
  const id = randomUUID();
  const key = `tbk_${id}_${randomBytes(32).toString("base64url")}`;

  return { id, key, keyHash: hashKey(key) };
}

/**
 * Resolves `Authorization: Bearer tbk_...` to an active client, or null.
 *
 * Hashes are compared in constant time, and a revoked, unknown, or malformed
 * key all answer the same way, so the response never tells a caller which part
 * was wrong.
 */
export async function authenticateClient(authorization, { findClient }) {
  const match = /^Bearer (\S+)$/.exec(authorization ?? "");
  const parts = match ? KEY_PATTERN.exec(match[1]) : null;

  if (!parts) {
    return null;
  }

  const client = await findClient(parts[1]);

  if (!client || client.status !== "active") {
    return null;
  }

  const expected = Buffer.from(client.keyHash, "hex");
  const actual = Buffer.from(hashKey(match[1]), "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? client
    : null;
}
