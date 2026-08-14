import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase.js";
import { buildPublicSummary } from "./reportSchemas.js";

const REPORTS_COLLECTION = "reports";

export const REPORT_PAGE_SIZE = 10;

// A report with no movement for this long is flagged as possibly out of date.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The resident's own view of one of their reports.
 *
 * Built from an owner-scoped query, so it may include the protected fields the
 * resident themselves supplied. It must never be reused for the public feed.
 */
export function toPersonalReport(id, raw = {}) {
  const createdAtMillis =
    typeof raw.createdAt?.toMillis === "function"
      ? raw.createdAt.toMillis()
      : null;

  return Object.freeze({
    id,
    kind: raw.kind === "help" ? "help" : "flood",
    publicLocationLabel: raw.publicLocationLabel ?? "",
    description: raw.description ?? "",
    severity: raw.severity ?? null,
    need: raw.need ?? null,
    peopleAffected: raw.peopleAffected ?? null,
    verificationStatus: raw.verificationStatus ?? "pending",
    incidentStatus: raw.incidentStatus ?? "new",
    createdAtMillis,
    isCancelled: raw.incidentStatus === "cancelled",
    // Computed when the page is fetched rather than during render, so the
    // card stays a pure function of its props.
    isStale:
      createdAtMillis !== null &&
      Date.now() - createdAtMillis > STALE_AFTER_MS &&
      raw.incidentStatus !== "resolved" &&
      raw.incidentStatus !== "cancelled",
  });
}

/**
 * Assembles the stored document.
 *
 * Precise coordinates and the contact number are written as protected fields
 * and are never mirrored into the public summary. Timestamps come from the
 * server so a device with a wrong clock cannot reorder an incident queue.
 */
export function buildReportDocument({ reporterId, values, images }) {
  const base = {
    reporterId,
    kind: values.kind,
    publicLocationLabel: values.publicLocationLabel,
    publicSummary: buildPublicSummary(values),
    // Protected: readable only by the reporter and trusted responders.
    preciseLocation: {
      latitude: values.latitude,
      longitude: values.longitude,
    },
    description: values.description,
    contactPhone: values.contactPhone,
    imagePaths: images.map((image) => image.publicId),
    publicImagePaths: [],
    priority: "medium",
    verificationStatus: "pending",
    incidentStatus: "new",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return values.kind === "flood"
    ? { ...base, severity: values.severity }
    : { ...base, need: values.need, peopleAffected: values.peopleAffected };
}

export function createReportRepository({
  db,
  documentRef = doc,
  transactionRunner = runTransaction,
  collectionRef = collection,
  runQuery = getDocs,
} = {}) {
  return {
    /**
     * Creates a report at a caller-supplied id.
     *
     * The id is generated once per form session, so a double click, a retry
     * after a timeout, or a resubmit from a flaky connection all resolve to the
     * same document instead of filing the same emergency several times.
     */
    async submitReport({ reportId, reporterId, values, images }) {
      const database = db ?? getFirebaseDb();
      const reference = documentRef(database, REPORTS_COLLECTION, reportId);

      await transactionRunner(database, async (transaction) => {
        const existing = await transaction.get(reference);

        if (existing.exists()) {
          // Already filed by an earlier attempt; treat as success.
          return;
        }

        transaction.set(
          reference,
          buildReportDocument({ reporterId, values, images }),
        );
      });

      return { reportId };
    },

    /**
     * Lists the signed-in resident's own reports, one bounded page at a time.
     *
     * The query is restricted by reporterId rather than filtered in the client,
     * so another resident's record is never fetched in the first place. Ordering
     * is by createdAt then document id, which is deterministic even when two
     * reports share a timestamp, so pages cannot duplicate or skip records.
     */
    async listMyReports({ reporterId, cursor = null, pageSize = REPORT_PAGE_SIZE } = {}) {
      const database = db ?? getFirebaseDb();
      const boundedSize = Math.min(Math.max(1, pageSize), REPORT_PAGE_SIZE);
      const constraints = [
        where("reporterId", "==", reporterId),
        orderBy("createdAt", "desc"),
        orderBy("__name__", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(boundedSize),
      ];

      const snapshot = await runQuery(
        query(collectionRef(database, REPORTS_COLLECTION), ...constraints),
      );

      return {
        reports: snapshot.docs.map((document) =>
          toPersonalReport(document.id, document.data()),
        ),
        cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
        hasMore: snapshot.docs.length === boundedSize,
      };
    },

    /**
     * Cancels a report instead of deleting it.
     *
     * An emergency record that responders may already have acted on must not
     * vanish, so the document and its event history are retained and only the
     * incident status changes.
     */
    async cancelReport({ reportId }) {
      const database = db ?? getFirebaseDb();

      await updateDoc(documentRef(database, REPORTS_COLLECTION, reportId), {
        incidentStatus: "cancelled",
        updatedAt: serverTimestamp(),
      });
    },
  };
}
