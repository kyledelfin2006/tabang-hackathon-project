import { getApiClient } from "../http/apiClient.js";
import { toMillis } from "../data/unwrap.js";

export const ADVISORY_PAGE_SIZE = 6;

const ALLOWED_KINDS = new Set(["flood", "help", "advisory"]);
const MAX_SUMMARY_LENGTH = 240;

function asText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Projects a public_feed row onto the only fields the UI may render.
 *
 * Anything not listed here - precise coordinates, contact numbers, private
 * descriptions, original image paths - is dropped before it reaches a
 * component, so an over-broad row cannot leak through the view. Takes plain
 * values: the timestamp is in milliseconds.
 */
export function toPublicAdvisory(id, raw = {}) {
  return Object.freeze({
    id,
    summary: asText(raw.summary, MAX_SUMMARY_LENGTH),
    barangay: asText(raw.barangay, 80),
    municipality: asText(raw.municipality, 80),
    // Where it came from: "tabang" for a responder, or a partner such as
    // "dost-signal" for an official signal.
    source: asText(raw.source, 64) || "tabang",
    kind: ALLOWED_KINDS.has(raw.kind) ? raw.kind : "advisory",
    createdAtMillis: Number.isFinite(raw.createdAtMillis)
      ? raw.createdAtMillis
      : null,
    expiresAtMillis: Number.isFinite(raw.expiresAtMillis)
      ? raw.expiresAtMillis
      : null,
  });
}

function rowToAdvisory(row) {
  return toPublicAdvisory(row.id, {
    ...row,
    createdAtMillis: row.createdAtMillis ?? toMillis(row.created_at || row.createdAt),
    expiresAtMillis: row.expiresAtMillis ?? toMillis(row.expires_at || row.expiresAt),
  });
}

export function createAdvisoryRepository({ client } = {}) {
  const api = () => client ?? getApiClient();

  return {
    /**
     * Reads at most ADVISORY_PAGE_SIZE sanitized items.
     */
    async listRecentAdvisories({ pageSize = ADVISORY_PAGE_SIZE } = {}) {
      const rows = await api().get("/api/app/advisories", { query: { pageSize } });
      return rows.map(rowToAdvisory);
    },

    /** The signed-in responder's own advisories, published or not. */
    /* eslint-disable-next-line no-unused-vars */
    async listOwnAdvisories(actorId) {
      const rows = await api().get("/api/app/advisories/mine");
      return rows.map((row) =>
        Object.freeze({ ...rowToAdvisory(row), published: row.published }),
      );
    },

    /**
     * Publishes an advisory as the signed-in responder.
     */
    async publishAdvisory({ summary, municipality, barangay }) {
      await api().post("/api/app/advisories", {
        summary,
        municipality: municipality || null,
        barangay: barangay || null,
      });
    },

    async unpublishAdvisory(id) {
      await api().post(`/api/app/advisories/${id}/unpublish`);
    },
  };
}
