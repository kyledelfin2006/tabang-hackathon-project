import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase.js";
import { buildPublicSummary } from "./reportSchemas.js";

const REPORTS_COLLECTION = "reports";

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
  };
}
