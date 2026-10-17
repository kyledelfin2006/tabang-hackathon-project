import { getSupabaseClient } from "../../config/supabase.js";
import { toDataError, toMillis, unwrap } from "../data/unwrap.js";

const EVIDENCE_BUCKET = "identity-evidence";

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
  const supabase = () => client ?? getSupabaseClient();

  return {
    async getMyApplication(uid) {
      const row = unwrap(
        await supabase()
          .from("responder_applications")
          .select("status, organization, badge_number, municipality, review_notes, submitted_at")
          .eq("applicant_id", uid)
          .maybeSingle(),
      );

      return row
        ? toApplicationView({
            status: row.status,
            organization: row.organization,
            badgeNumber: row.badge_number,
            municipality: row.municipality,
            reviewNotes: row.review_notes,
            submittedAtMillis: toMillis(row.submitted_at),
          })
        : null;
    },

    /**
     * Submits an application in the pending state.
     *
     * Applying grants nothing. Responder access comes only from a reviewer's
     * decision, which writes role_assignments inside the database, so this is
     * a request rather than a credential. The function sets the status and
     * clears any earlier review itself; the client cannot choose either.
     */
    async submitApplication({ values, evidence }) {
      unwrap(
        await supabase().rpc("submit_application", {
          organization: values.organization,
          badge_number: values.badgeNumber,
          municipality: values.municipality,
          identity_document_path: evidence.identityDocumentPath,
          selfie_path: evidence.selfiePath,
          consent_version: CONSENT_VERSION,
        }),
      );
    },

    /**
     * Stores identity evidence in the private identity-evidence bucket, under
     * the applicant's own folder. These files never share a bucket with report
     * photos, so an ID document cannot end up readable by responders.
     */
    async uploadEvidence(file, { onProgress, signal } = {}) {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      const uid = session?.user?.id;

      if (!uid) {
        throw new Error("Sign in before uploading identity documents.");
      }

      if (signal?.aborted) {
        throw new Error("The upload was cancelled.");
      }

      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase()
        .storage.from(EVIDENCE_BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg" });

      if (error) {
        throw toDataError(error);
      }

      onProgress?.(100);

      return { path };
    },
  };
}
