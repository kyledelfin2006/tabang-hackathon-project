import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "../../config/firebase.js";
import { APPLICATION_STATUS } from "./applicationRepository.js";

const APPLICATIONS_COLLECTION = "responderApplications";
const ROLE_ASSIGNMENTS_COLLECTION = "roleAssignments";

export const REVIEW_PAGE_SIZE = 20;

export function toReviewItem(id, raw = {}) {
  return Object.freeze({
    id,
    applicantId: raw.applicantId ?? id,
    organization: raw.organization ?? "",
    badgeNumber: raw.badgeNumber ?? "",
    municipality: raw.municipality ?? "",
    consentVersion: raw.consentVersion ?? "",
    identityDocumentPath: raw.identityDocumentPath ?? null,
    selfiePath: raw.selfiePath ?? null,
    submittedAtMillis:
      typeof raw.submittedAt?.toMillis === "function"
        ? raw.submittedAt.toMillis()
        : null,
  });
}

export function createReviewRepository({
  db,
  auth,
  collectionRef = collection,
  documentRef = doc,
  runQuery = getDocs,
  transactionRunner = runTransaction,
  deleteEvidence,
} = {}) {
  async function destroyEvidence(publicId, idToken) {
    if (!publicId) {
      return;
    }

    await fetch("/api/uploads/identity-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, publicId }),
    });
  }

  return {
    async listPendingApplications() {
      const database = db ?? getFirebaseDb();
      const snapshot = await runQuery(
        query(
          collectionRef(database, APPLICATIONS_COLLECTION),
          where("status", "==", APPLICATION_STATUS.pending),
          orderBy("submittedAt", "asc"),
          limit(REVIEW_PAGE_SIZE),
        ),
      );

      return snapshot.docs.map((document) =>
        toReviewItem(document.id, document.data()),
      );
    },

    /**
     * Records a decision and, on approval, grants the role.
     *
     * Both writes happen in one transaction: an application marked approved
     * without a matching role assignment would be a responder who cannot work,
     * and a role assignment without a recorded decision would be an
     * unattributable grant.
     */
    async decide({ application, approve, notes, reviewerId }) {
      const database = db ?? getFirebaseDb();
      const applicationRef = documentRef(
        database,
        APPLICATIONS_COLLECTION,
        application.id,
      );
      const roleRef = documentRef(
        database,
        ROLE_ASSIGNMENTS_COLLECTION,
        application.applicantId,
      );

      await transactionRunner(database, async (transaction) => {
        transaction.update(applicationRef, {
          status: approve
            ? APPLICATION_STATUS.approved
            : APPLICATION_STATUS.rejected,
          reviewedBy: reviewerId,
          reviewedAt: serverTimestamp(),
          reviewNotes: notes ?? "",
          // The evidence is destroyed immediately after this transaction, so
          // the stored paths must not outlive the decision.
          identityDocumentPath: null,
          selfiePath: null,
        });

        if (approve) {
          transaction.set(roleRef, {
            userId: application.applicantId,
            role: "responder",
            assignedBy: reviewerId,
            assignedAt: serverTimestamp(),
          });
        }
      });

      // Deletion happens after the decision is durable. If it fails, the
      // decision still stands and the evidence can be purged manually.
      const remove = deleteEvidence ?? destroyEvidence;
      const idToken = await (auth ?? getFirebaseAuth()).currentUser?.getIdToken();

      await remove(application.identityDocumentPath, idToken);
      await remove(application.selfiePath, idToken);
    },
  };
}
