import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase.js";

export const ADVISORY_PAGE_SIZE = 6;

const PUBLIC_FEED_COLLECTION = "publicFeed";
const ALLOWED_KINDS = new Set(["flood", "help", "advisory"]);
const MAX_SUMMARY_LENGTH = 240;

function asText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toMillis(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Projects a publicFeed document onto the only fields the UI may render.
 *
 * Anything not listed here - precise coordinates, contact numbers, private
 * descriptions, original image paths - is dropped before it reaches a
 * component, so an over-broad document cannot leak through the view.
 */
export function toPublicAdvisory(id, raw = {}) {
  return Object.freeze({
    id,
    summary: asText(raw.summary, MAX_SUMMARY_LENGTH),
    barangay: asText(raw.barangay, 80),
    kind: ALLOWED_KINDS.has(raw.kind) ? raw.kind : "advisory",
    createdAtMillis: toMillis(raw.createdAt),
  });
}

export function createAdvisoryRepository({ db } = {}) {
  return {
    /**
     * Reads at most ADVISORY_PAGE_SIZE sanitized items. The legacy homepage
     * fetched every floodReports and helpRequests document to build an image
     * carousel; this query is bounded and never touches those collections.
     */
    async listRecentAdvisories({ pageSize = ADVISORY_PAGE_SIZE } = {}) {
      const database = db ?? getFirebaseDb();
      const boundedSize = Math.min(Math.max(1, pageSize), ADVISORY_PAGE_SIZE);

      const snapshot = await getDocs(
        query(
          collection(database, PUBLIC_FEED_COLLECTION),
          where("published", "==", true),
          orderBy("createdAt", "desc"),
          limit(boundedSize),
        ),
      );

      return snapshot.docs.map((document) =>
        toPublicAdvisory(document.id, document.data()),
      );
    },
  };
}
