import { ApiError } from "../http.mjs";
import { hashToken, parseSessionCookie } from "../sessions.mjs";

export async function getSession(req, store) {
  const token = parseSessionCookie(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  return store.findSessionByTokenHash(tokenHash);
}

export async function requireSession(req, store) {
  const session = await getSession(req, store);
  if (!session) {
    throw new ApiError(401, "unauthorized", "Sign-in required.");
  }
  return session;
}

export async function requireRole(req, store, allowedRoles = []) {
  const session = await requireSession(req, store);
  const role = session.role || "resident";
  if (!allowedRoles.includes(role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }
  return session;
}

export function mapDatabaseError(err) {
  if (err instanceof ApiError) return err;
  const msg = err.message || "";
  if (msg.includes("not_found")) {
    return new ApiError(404, "not_found", "The requested record was not found.");
  }
  if (msg.includes("forbidden")) {
    return new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }
  if (msg.includes("already_claimed")) {
    return new ApiError(409, "already_claimed", "This incident has already been claimed.");
  }
  if (msg.includes("invalid_transition")) {
    return new ApiError(409, "invalid_transition", "That status change is not allowed.");
  }
  if (msg.includes("not_cancellable")) {
    return new ApiError(409, "not_cancellable", "This report can no longer be cancelled.");
  }
  if (msg.includes("invalid_request")) {
    return new ApiError(400, "invalid_request", "The request is invalid.");
  }
  if (err.code === "23514" || err.code === "23502") {
    return new ApiError(400, "invalid_request", "Validation failed.");
  }
  if (err.code === "23505") {
    return new ApiError(409, "conflict", "A duplicate record already exists.");
  }
  return new ApiError(500, "internal", "Database operation failed.");
}
