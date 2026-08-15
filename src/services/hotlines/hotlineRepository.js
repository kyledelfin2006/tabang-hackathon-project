import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase.js";

const HOTLINES_COLLECTION = "hotlines";
const REVIEWS_SUBCOLLECTION = "reviews";

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
 * the failure that matters here.
 */
export function toHotline(id, raw = {}, now = Date.now()) {
  const verifiedAtMillis =
    typeof raw.verifiedAt?.toMillis === "function"
      ? raw.verifiedAt.toMillis()
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

export function createHotlineRepository({
  db,
  documentRef = doc,
  collectionRef = collection,
  runQuery = getDocs,
  readDocument = getDoc,
  transactionRunner = runTransaction,
  now = () => Date.now(),
} = {}) {
  return {
    /**
     * One directory, read by residents and responders alike.
     *
     * The legacy pages each hardcoded their own copy of the numbers, so the
     * two views could disagree about what to call in an emergency.
     */
    async listHotlines() {
      const database = db ?? getFirebaseDb();
      const snapshot = await runQuery(
        query(
          collectionRef(database, HOTLINES_COLLECTION),
          orderBy("organization", "asc"),
          limit(HOTLINE_PAGE_SIZE),
        ),
      );
      const clock = now();

      return snapshot.docs.map((document) =>
        toHotline(document.id, document.data(), clock),
      );
    },

    async getMyReview({ hotlineId, uid }) {
      const database = db ?? getFirebaseDb();
      const snapshot = await readDocument(
        documentRef(
          database,
          HOTLINES_COLLECTION,
          hotlineId,
          REVIEWS_SUBCOLLECTION,
          uid,
        ),
      );

      return snapshot.exists()
        ? Object.freeze({
            rating: snapshot.data().rating ?? null,
            comment: snapshot.data().comment ?? "",
          })
        : null;
    },

    /**
     * Records one review per account per hotline.
     *
     * The review lives at the reviewer's own uid, so a second submission
     * replaces their previous one rather than stacking. The aggregate is
     * recomputed inside the same transaction from the previous value, so a
     * client cannot post an arbitrary total: the legacy page generated vote
     * counts with Math.random and kept them in memory.
     */
    async submitReview({ hotlineId, uid, rating, comment }) {
      const database = db ?? getFirebaseDb();
      const hotlineRef = documentRef(database, HOTLINES_COLLECTION, hotlineId);
      const reviewRef = documentRef(
        database,
        HOTLINES_COLLECTION,
        hotlineId,
        REVIEWS_SUBCOLLECTION,
        uid,
      );

      await transactionRunner(database, async (transaction) => {
        const [hotlineSnapshot, existingReview] = await Promise.all([
          transaction.get(hotlineRef),
          transaction.get(reviewRef),
        ]);

        if (!hotlineSnapshot.exists()) {
          throw new Error("That hotline is no longer listed.");
        }

        const hotline = hotlineSnapshot.data();
        const previousRating = existingReview.exists()
          ? (existingReview.data().rating ?? 0)
          : null;
        const ratingCount = Number.isInteger(hotline.ratingCount)
          ? hotline.ratingCount
          : 0;
        const ratingTotal = Number.isInteger(hotline.ratingTotal)
          ? hotline.ratingTotal
          : 0;

        transaction.set(reviewRef, {
          rating,
          comment,
          reviewerId: uid,
          updatedAt: serverTimestamp(),
        });

        transaction.update(hotlineRef, {
          ratingCount: previousRating === null ? ratingCount + 1 : ratingCount,
          ratingTotal:
            previousRating === null
              ? ratingTotal + rating
              : ratingTotal - previousRating + rating,
          updatedAt: serverTimestamp(),
        });
      });
    },
  };
}
