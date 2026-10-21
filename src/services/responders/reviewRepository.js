import { getApiClient } from "../http/apiClient.js";
import { toMillis } from "../data/unwrap.js";

export const REVIEW_PAGE_SIZE = 20;

/** Takes plain values: the timestamp is in milliseconds. */
export function toReviewItem(id, raw = {}) {
  return Object.freeze({
    id,
    applicantId: raw.applicantId ?? id,
    applicantName: raw.applicantName ?? "",
    applicantEmail: raw.applicantEmail ?? "",
    organization: raw.organization ?? "",
    badgeNumber: raw.badgeNumber ?? "",
    municipality: raw.municipality ?? "",
    consentVersion: raw.consentVersion ?? "",
    identityDocumentPath: raw.identityDocumentPath ?? null,
    selfiePath: raw.selfiePath ?? null,
    submittedAtMillis: Number.isFinite(raw.submittedAtMillis)
      ? raw.submittedAtMillis
      : null,
  });
}

export function createReviewRepository({ client } = {}) {
  const api = () => client ?? getApiClient();

  return {
    async listPendingApplications() {
      const items = await api().get("/api/app/applications");
      return (items || []).map((item) =>
        toReviewItem(item.applicantId || item.id, {
          applicantId: item.applicantId || item.id,
          applicantName: item.applicantName,
          applicantEmail: item.applicantEmail,
          organization: item.organization,
          badgeNumber: item.badgeNumber,
          municipality: item.municipality,
          consentVersion: item.consentVersion,
          identityDocumentPath: item.identityDocumentPath,
          selfiePath: item.selfiePath,
          submittedAtMillis: item.submittedAtMillis ?? toMillis(item.submittedAt),
        }),
      );
    },

    /** An authorized link to one evidence file, for a reviewer to open. */
    async getEvidenceUrl(path) {
      if (!path) return "";
      const cleanPath = String(path).replace(/^\/+/, "");
      return `/api/app/files/identity-evidence/${cleanPath}`;
    },

    /**
     * Records a decision and, on approval, grants the role.
     * The server deletes the applicant's evidence files on decision and returns { ok, evidenceDeleted }.
     */
    async decide({ application, approve, notes }) {
      const res = await api().post(
        `/api/app/applications/${application.applicantId}/decision`,
        {
          approve: Boolean(approve),
          notes: notes ?? "",
        },
      );

      return { evidenceDeleted: Boolean(res?.evidenceDeleted) };
    },
  };
}
