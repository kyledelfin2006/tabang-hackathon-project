import { getSupabaseClient } from "../../config/supabase.js";
import { toMillis, unwrap } from "../data/unwrap.js";

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

const FEED_COLUMNS =
  "id, kind, summary, municipality, barangay, source, published, created_at, expires_at";

function rowToAdvisory(row) {
  return toPublicAdvisory(row.id, {
    ...row,
    createdAtMillis: toMillis(row.created_at),
    expiresAtMillis: toMillis(row.expires_at),
  });
}

export function createAdvisoryRepository({ client } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    /**
     * Reads at most ADVISORY_PAGE_SIZE sanitized items. The legacy homepage
     * fetched every report to build an image carousel; this query is bounded
     * and reads only the public feed. Expired items are already hidden by the
     * database; the published filter also hides an author's own drafts.
     */
    async listRecentAdvisories({ pageSize = ADVISORY_PAGE_SIZE } = {}) {
      const boundedSize = Math.min(Math.max(1, pageSize), ADVISORY_PAGE_SIZE);
      const rows = unwrap(
        await supabase()
          .from("public_feed")
          .select(FEED_COLUMNS)
          .eq("published", true)
          .order("created_at", { ascending: false })
          .limit(boundedSize),
      );

      return rows.map(rowToAdvisory);
    },

    /** The signed-in responder's own advisories, published or not. */
    async listOwnAdvisories(actorId) {
      const rows = unwrap(
        await supabase()
          .from("public_feed")
          .select(FEED_COLUMNS)
          .eq("created_by", actorId)
          .order("created_at", { ascending: false })
          .limit(20),
      );

      return rows.map((row) =>
        Object.freeze({ ...rowToAdvisory(row), published: row.published }),
      );
    },

    /**
     * Publishes an advisory as the signed-in responder. The author and the
     * "tabang" source are set by the database, so they cannot be chosen here.
     */
    async publishAdvisory({ summary, municipality, barangay }) {
      unwrap(
        await supabase()
          .from("public_feed")
          .insert({
            kind: "advisory",
            summary,
            municipality: municipality || null,
            barangay: barangay || null,
          }),
      );
    },

    async unpublishAdvisory(id) {
      unwrap(
        await supabase()
          .from("public_feed")
          .update({ published: false })
          .eq("id", id),
      );
    },
  };
}