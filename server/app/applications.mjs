import {
  CONSENT_VERSION,
  toApplicationView,
  validateApplication,
} from "../../src/services/responders/applicationRepository.js";
import { toReviewItem } from "../../src/services/responders/reviewRepository.js";
import { mapDatabaseError, requireRole, requireSession } from "./auth.mjs";
import { ApiError } from "../http.mjs";
import { deleteEvidenceFolder } from "../files.mjs";

export const APPLICATION_ROUTES = [
  {
    method: "GET",
    path: "/api/app/applications/mine",
    handler: async ({ req, store }) => {
      const session = await requireSession(req, store);

      try {
        const row = await store.getMyApplication(session.user.id);
        return {
          status: 200,
          body: row
            ? toApplicationView({
                status: row.status,
                organization: row.organization,
                badgeNumber: row.badgeNumber,
                municipality: row.municipality,
                reviewNotes: row.reviewNotes,
                submittedAtMillis: row.submittedAt ? Date.parse(row.submittedAt) : null,
              })
            : null,
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/applications",
    handler: async ({ req, body, store }) => {
      const session = await requireSession(req, store);

      const values = body?.values || {};
      const evidence = body?.evidence || {};
      const hasEvidence = Boolean(evidence.identityDocumentPath && evidence.selfiePath);

      const { errors, isValid } = validateApplication(values, { hasEvidence });
      if (!isValid) {
        const firstMessage = Object.values(errors)[0] || "Invalid application.";
        throw new ApiError(400, "invalid_request", firstMessage);
      }

      try {
        await store.submitApplication(session.user.id, {
          organization: values.organization,
          badgeNumber: values.badgeNumber,
          municipality: values.municipality,
          identityDocumentPath: evidence.identityDocumentPath,
          selfiePath: evidence.selfiePath,
          consentVersion: body?.consentVersion || CONSENT_VERSION,
        });

        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/applications",
    handler: async ({ req, query, store }) => {
      await requireRole(req, store, ["reviewer", "admin"]);
      const limit = Math.min(Math.max(1, Number(query.get("pageSize") || 20)), 20);

      try {
        const rows = await store.listPendingApplications({ limit });
        const items = rows.map((r) =>
          toReviewItem(r.applicantId, {
            applicantId: r.applicantId,
            applicantName: r.applicantName,
            applicantEmail: r.applicantEmail,
            organization: r.organization,
            badgeNumber: r.badgeNumber,
            municipality: r.municipality,
            consentVersion: r.consentVersion,
            identityDocumentPath: r.identityDocumentPath,
            selfiePath: r.selfiePath,
            submittedAtMillis: r.submittedAt ? Date.parse(r.submittedAt) : null,
          }),
        );

        return { status: 200, body: items };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/applications/{applicantId}/decision",
    handler: async ({ req, params, body, store, env }) => {
      const session = await requireRole(req, store, ["reviewer", "admin"]);
      const approve = Boolean(body?.approve);
      const notes = typeof body?.notes === "string" ? body.notes : "";

      try {
        await store.decideApplication(session.user.id, params.applicantId, approve, notes);
        const evidenceDeleted = deleteEvidenceFolder(params.applicantId, { env });
        return { status: 200, body: { ok: true, evidenceDeleted } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
];
