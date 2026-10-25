import { getSupabaseClient } from "../../config/supabase.js";
import { toMillis, unwrap } from "../data/unwrap.js";
import { APPLICATION_STATUS } from "./applicationRepository.js";

const EVIDENCE_BUCKET = "identity-evidence";

export const REVIEW_PAGE_SIZE = 20;

// Long enough to look at a document, short enough that a copied link dies.
const EVIDENCE_LINK_SECONDS = 5 * 60;

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
  const supabase = () => client ?? getSupabaseClient();

  return {
    async listPendingApplications() {
      const rows = unwrap(
        await supabase()
          .from("responder_applications")
          .select("*")
          .eq("status", APPLICATION_STATUS.pending)
          .order("submitted_at", { ascending: true })
          .limit(REVIEW_PAGE_SIZE),
      );

      // Reviewers may read applicants' profiles, so the name and email come
      // from the account itself rather than anything typed on the form.
      const profiles =
        rows.length === 0
          ? []
          : unwrap(
              await supabase()
                .from("profiles")
                .select("id, display_name, email")
                .in(
                  "id",
                  rows.map((row) => row.applicant_id),
                ),
            );
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));

      return rows.map((row) =>
        toReviewItem(row.applicant_id, {
          applicantId: row.applicant_id,
          applicantName: byId.get(row.applicant_id)?.display_name,
          applicantEmail: byId.get(row.applicant_id)?.email,
          organization: row.organization,
          badgeNumber: row.badge_number,
          municipality: row.municipality,
          consentVersion: row.consent_version,
          identityDocumentPath: row.identity_document_path,
          selfiePath: row.selfie_path,
          submittedAtMillis: toMillis(row.submitted_at),
        }),
      );
    },

    /** An expiring link to one evidence file, for a reviewer to open. */
    async getEvidenceUrl(path) {
      const { signedUrl } = unwrap(
        await supabase()
          .storage.from(EVIDENCE_BUCKET)
          .createSignedUrl(path, EVIDENCE_LINK_SECONDS),
      );

      return signedUrl;
    },

    /**
     * Records a decision and, on approval, grants the role.
     *
     * The database function does both in one transaction: an application
     * marked approved without a matching role would be a responder who cannot
     * work, and a role without a recorded decision would be an unattributable
     * grant. It also clears the stored evidence paths.
     *
     * The files are deleted only after the decision is durable. A failed
     * deletion does not undo the decision; it is reported so the files can be
     * removed again, and this never throws once the decision has committed.
     */
    async decide({ application, approve, notes }) {
      unwrap(
        await supabase().rpc("decide_application", {
          applicant_id: application.applicantId,
          approve,
          notes: notes ?? "",
        }),
      );

      const paths = [
        application.identityDocumentPath,
        application.selfiePath,
      ].filter(Boolean);

      if (paths.length === 0) {
        return { evidenceDeleted: true };
      }

      try {
        const { data, error } = await supabase()
          .storage.from(EVIDENCE_BUCKET)
          .remove(paths);

        return { evidenceDeleted: !error && data?.length === paths.length };
      } catch {
        return { evidenceDeleted: false };
      }
    },
  };
}