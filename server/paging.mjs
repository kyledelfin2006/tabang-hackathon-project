import { ApiError } from "./http.mjs";

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export function parseLimit(query) {
  const raw = query.get("limit");

  if (raw === null) {
    return DEFAULT_LIMIT;
  }

  const limit = Number(raw);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(
      400,
      "invalid_request",
      `limit must be a whole number from 1 to ${MAX_LIMIT}.`,
    );
  }

  return limit;
}

/**
 * Cursors are opaque to partners: the position of the last item, encoded.
 * Ordering by a timestamp and then the id means a page boundary never skips
 * or repeats an item, even when two share a timestamp.
 */
export function encodeCursor(at, id) {
  return Buffer.from(JSON.stringify({ at, id })).toString("base64url");
}

export function decodeCursor(query) {
  const raw = query.get("cursor");

  if (raw === null) {
    return null;
  }

  try {
    const { at, id } = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));

    // Both values end up inside a database filter, so they are held to exact
    // shapes rather than trusted.
    if (
      typeof at === "string" &&
      /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(at) &&
      typeof id === "string" &&
      /^[0-9a-f-]{36}$/.test(id)
    ) {
      return { at, id };
    }
  } catch {
    // Falls through to the error below.
  }

  throw new ApiError(400, "invalid_request", "cursor is not one this API issued.");
}

/** Returns the page and the cursor after its last item, or null at the end. */
export function pageOf(rows, limit, positionOf) {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    page,
    nextCursor:
      rows.length > limit && last ? encodeCursor(...positionOf(last)) : null,
  };
}
