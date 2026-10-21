import { getApiClient } from "../http/apiClient.js";
import { toMillis } from "../data/unwrap.js";

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
      coverageArea: row.coverageArea || row.coverage_area,
      phoneNumbers: row.phoneNumbers || row.phone_numbers,
      verified: row.verified,
      verifiedAtMillis: row.verifiedAtMillis ?? toMillis(row.verified_at || row.verifiedAt),
      verifiedBy: row.verifiedBy || row.verified_by,
      ratingCount: row.ratingCount ?? row.rating_count,
      ratingTotal: row.ratingTotal ?? row.rating_total,
    },
    now,
  );
}

export function createHotlineRepository({ client, now = () => Date.now() } = {}) {
  const api = () => client ?? getApiClient();

  return {
    /**
     * One directory, read by residents and responders alike.
     */
    async listHotlines() {
      const rows = await api().get("/api/app/hotlines");
      const clock = now();

      return rows.map((row) => rowToHotline(row, clock));
    },

    async getMyReview({ hotlineId }) {
      const row = await api().get(`/api/app/hotlines/${hotlineId}/review`);

      return row
        ? Object.freeze({ rating: row.rating ?? null, comment: row.comment ?? "" })
        : null;
    },

    /**
     * Records one review per account per hotline.
     */
    async submitReview({ hotlineId, rating, comment }) {
      await api().put(`/api/app/hotlines/${hotlineId}/review`, { rating, comment });
    },
  };
}
