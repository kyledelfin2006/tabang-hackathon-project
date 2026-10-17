import { getSupabaseClient } from "../../config/supabase.js";
import { toMillis, unwrap } from "../data/unwrap.js";
import { APPLICATION_STATUS } from "./applicationRepository.js";

const EVIDENCE_BUCKET = "identity-evidence";

export const REVIEW_PAGE_SIZE = 20;

/** Takes plain values: the timestamp is in milliseconds. */
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

      return rows.map((row) =>
        toReviewItem(row.applicant_id, {
          applicantId: row.applicant_id,
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

      const paths = [application.identityDocumentPath, application.selfiePath].filter(
        Boolean,
      );

      if (paths.length === 0) {
        return { evidenceDeleted: true };
      }

      try {
        const { data, error } = await supabase().storage.from(EVIDENCE_BUCKET).remove(paths);

        return { evidenceDeleted: !error && data?.length === paths.length };
      } catch {
        return { evidenceDeleted: false };
      }
    },
  };
}
