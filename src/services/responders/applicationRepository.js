import { getApiClient } from "../http/apiClient.js";
import { toMillis } from "../data/unwrap.js";

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
    submittedAtMillis: Number.isFinite(raw.submittedAtMillis)
      ? raw.submittedAtMillis
      : null,
  });
}

export function createApplicationRepository({ client } = {}) {
  const api = () => client ?? getApiClient();

  return {
    /* eslint-disable-next-line no-unused-vars */
    async getMyApplication(uid) {
      const row = await api().get("/api/app/applications/mine");

      return row
        ? toApplicationView({
            status: row.status,
            organization: row.organization,
            badgeNumber: row.badgeNumber || row.badge_number,
            municipality: row.municipality,
            reviewNotes: row.reviewNotes || row.review_notes,
            submittedAtMillis: row.submittedAtMillis ?? toMillis(row.submitted_at || row.submittedAt),
          })
        : null;
    },

    /**
     * Submits an application in the pending state.
     */
    async submitApplication({ values, evidence }) {
      await api().post("/api/app/applications", { values, evidence });
    },

    /**
     * Stores identity evidence in the private identity-evidence folder.
     */
    async uploadEvidence(file, { onProgress, signal } = {}) {
      if (signal?.aborted) {
        throw new Error("The upload was cancelled.");
      }

      const res = await api().post("/api/app/files/identity-evidence", file, {
        headers: { "Content-Type": file.type || "image/jpeg" },
      });

      if (signal?.aborted) {
        throw new Error("The upload was cancelled.");
      }

      onProgress?.(100);

      return { path: res.path };
    },
  };
}
