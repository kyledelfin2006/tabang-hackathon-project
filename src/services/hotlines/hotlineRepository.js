import { getSupabaseClient } from "../../config/supabase.js";
import { toMillis, unwrap } from "../data/unwrap.js";

export const HOTLINE_PAGE_SIZE = 50;
export const MAX_COMMENT_LENGTH = 300;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

// A verification older than this is treated as needing rechecking.
export const VERIFICATION_STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

function collapse(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

/**
 * Projects a stored hotline for display.
 *
 * `verified` is never inferred from the record merely existing. A hotline is
 * only shown as verified when a reviewer has recorded a verification, because
 * telling a resident an emergency number is confirmed when nobody checked is
 * the failure that matters here. Takes plain values: the timestamp is in
 * milliseconds, and the rating totals are computed by the database.
 */
export function toHotline(id, raw = {}, now = Date.now()) {
  const verifiedAtMillis = Number.isFinite(raw.verifiedAtMillis)
    ? raw.verifiedAtMillis
    : null;
  const verified = raw.verified === true && verifiedAtMillis !== null;

  return Object.freeze({
    id,
    organization: collapse(raw.organization, 120),
    coverageArea: collapse(raw.coverageArea, 120),
    phoneNumbers: Array.isArray(raw.phoneNumbers)
      ? raw.phoneNumbers
          .filter((number) => typeof number === "string")
          .map((number) => collapse(number, 32))
          .filter(Boolean)
      : [],
    verified,
    verifiedAtMillis,
    verifiedBy: collapse(raw.verifiedBy, 120),
    verificationStale:
      verified && now - verifiedAtMillis > VERIFICATION_STALE_AFTER_MS,
    ratingCount: Number.isInteger(raw.ratingCount) ? raw.ratingCount : 0,
    ratingTotal: Number.isInteger(raw.ratingTotal) ? raw.ratingTotal : 0,
    averageRating:
      Number.isInteger(raw.ratingCount) && raw.ratingCount > 0
        ? Math.round((raw.ratingTotal / raw.ratingCount) * 10) / 10
        : null,
  });
}

export function validateReview({ rating, comment }) {
  const errors = {};
  const parsedRating = Number(rating);

  if (
    !Number.isInteger(parsedRating) ||
    parsedRating < MIN_RATING ||
    parsedRating > MAX_RATING
  ) {
    errors.rating = `Choose a rating from ${MIN_RATING} to ${MAX_RATING}.`;
  }

  const trimmed = collapse(comment, MAX_COMMENT_LENGTH + 1);

  if (trimmed.length > MAX_COMMENT_LENGTH) {
    errors.comment = `Keep your comment under ${MAX_COMMENT_LENGTH} characters.`;
  }

  return {
    values: { rating: parsedRating, comment: collapse(comment, MAX_COMMENT_LENGTH) },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

function rowToHotline(row, now) {
  return toHotline(
    row.id,
    {
      organization: row.organization,
      coverageArea: row.coverage_area,
      phoneNumbers: row.phone_numbers,
      verified: row.verified,
      verifiedAtMillis: toMillis(row.verified_at),
      verifiedBy: row.verified_by,
      ratingCount: row.rating_count,
      ratingTotal: row.rating_total,
    },
    now,
  );
}

export function createHotlineRepository({ client, now = () => Date.now() } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    /**
     * One directory, read by residents and responders alike.
     *
     * The legacy pages each hardcoded their own copy of the numbers, so the
     * two views could disagree about what to call in an emergency.
     */
    async listHotlines() {
      const rows = unwrap(
        await supabase()
          .from("hotline_directory")
          .select("*")
          .order("organization", { ascending: true })
          .limit(HOTLINE_PAGE_SIZE),
      );
      const clock = now();

      return rows.map((row) => rowToHotline(row, clock));
    },

    async getMyReview({ hotlineId, uid }) {
      const row = unwrap(
        await supabase()
          .from("hotline_reviews")
          .select("rating, comment")
          .eq("hotline_id", hotlineId)
          .eq("reviewer_id", uid)
          .maybeSingle(),
      );

      return row
        ? Object.freeze({ rating: row.rating ?? null, comment: row.comment ?? "" })
        : null;
    },

    /**
     * Records one review per account per hotline.
     *
     * The review is keyed by the hotline and the signed-in account, so a second
     * submission replaces the previous one rather than stacking. Totals are
     * computed from the stored reviews by the hotline_directory view, so there
     * is nothing for a client to forge: the legacy page generated vote counts
     * with Math.random and kept them in memory.
     */
    async submitReview({ hotlineId, rating, comment }) {
      unwrap(
        await supabase()
          .from("hotline_reviews")
          .upsert({ hotline_id: hotlineId, rating, comment }),
      );
    },
  };
}