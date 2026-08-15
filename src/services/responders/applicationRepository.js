import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "../../config/firebase.js";

const APPLICATIONS_COLLECTION = "responderApplications";

export const CONSENT_VERSION = "2026-04-privacy-and-terms";

export const APPLICATION_STATUS = Object.freeze({
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
});

/**
 * Validates an application.
 *
 * Personal details are not re-collected here: name, email, and barangay come
 * from the verified profile, so the applicant cannot claim a different identity
 * on the application than the one attached to their account.
 */
export function validateApplication(input = {}, { hasEvidence } = {}) {
  const errors = {};
  const organization = (input.organization ?? "").trim();
  const badgeNumber = (input.badgeNumber ?? "").trim();
  const municipality = (input.municipality ?? "").trim();

  if (organization.length < 2 || organization.length > 120) {
    errors.organization = "Enter the organization you respond with.";
  }

  if (badgeNumber.length < 2 || badgeNumber.length > 60) {
    errors.badgeNumber = "Enter your badge or employee number.";
  }

  if (municipality.length < 2 || municipality.length > 80) {
    errors.municipality = "Enter the municipality you cover.";
  }

  if (!input.consentAccepted) {
    errors.consentAccepted =
      "You must agree before submitting identity documents.";
  }

  if (!hasEvidence) {
    errors.evidence = "Attach a government ID and a selfie.";
  }

  return {
    values: { organization, badgeNumber, municipality },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function toApplicationView(raw) {
  if (!raw) {
    return null;
  }

  return Object.freeze({
    status: raw.status ?? APPLICATION_STATUS.pending,
    organization: raw.organization ?? "",
    badgeNumber: raw.badgeNumber ?? "",
    municipality: raw.municipality ?? "",
    reviewNotes: raw.reviewNotes ?? "",
    submittedAtMillis:
      typeof raw.submittedAt?.toMillis === "function"
        ? raw.submittedAt.toMillis()
        : null,
  });
}

export function createApplicationRepository({ db, auth } = {}) {
  return {
    async getMyApplication(uid) {
      const database = db ?? getFirebaseDb();
      const snapshot = await getDoc(
        doc(database, APPLICATIONS_COLLECTION, uid),
      );

      return snapshot.exists() ? toApplicationView(snapshot.data()) : null;
    },

    /**
     * Submits an application in the pending state.
     *
     * Applying grants nothing. Responder access comes only from a reviewer
     * writing roleAssignments, which no client can touch, so this document is
     * a request rather than a credential. The review fields are deliberately
     * absent; the rules reject a create that includes them.
     */
    async submitApplication({ uid, values, evidence }) {
      const database = db ?? getFirebaseDb();

      await setDoc(doc(database, APPLICATIONS_COLLECTION, uid), {
        applicantId: uid,
        organization: values.organization,
        badgeNumber: values.badgeNumber,
        municipality: values.municipality,
        identityDocumentPath: evidence.identityDocumentPath,
        selfiePath: evidence.selfiePath,
        consentVersion: CONSENT_VERSION,
        status: APPLICATION_STATUS.pending,
        submittedAt: serverTimestamp(),
      });
    },

    /**
     * Uploads identity evidence through the authenticated-delivery endpoint.
     *
     * These assets are never uploaded through the public report signature, so
     * an ID document cannot end up on the public delivery URL space.
     */
    async uploadEvidence(file, { onProgress, signal } = {}) {
      const currentUser = (auth ?? getFirebaseAuth()).currentUser;

      if (!currentUser) {
        throw new Error("Sign in before uploading identity documents.");
      }

      const response = await fetch("/api/uploads/identity-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await currentUser.getIdToken() }),
      });

      if (!response.ok) {
        throw new Error("Identity uploads are unavailable right now.");
      }

      const { cloudName, apiKey, params, signature } = await response.json();
      const form = new FormData();

      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("signature", signature);

      for (const [key, value] of Object.entries(params)) {
        form.append(key, String(value));
      }

      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.open(
          "POST",
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        );

        request.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error("The document upload was rejected."));

            return;
          }

          try {
            resolve({ publicId: JSON.parse(request.responseText).public_id });
          } catch {
            reject(new Error("The upload response could not be read."));
          }
        };

        request.onerror = () =>
          reject(new Error("The upload failed. Check your connection."));
        request.onabort = () => reject(new Error("The upload was cancelled."));

        signal?.addEventListener("abort", () => request.abort(), { once: true });

        request.send(form);
      });
    },
  };
}
