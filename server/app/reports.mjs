import { buildPublicSummary } from "../../src/services/reports/reportSchemas.js";
import { toPersonalReport } from "../../src/services/reports/reportRepository.js";
import { mapDatabaseError, requireSession } from "./auth.mjs";
import { ApiError } from "../http.mjs";

export const REPORT_ROUTES = [
  {
    method: "POST",
    path: "/api/app/reports",
    handler: async ({ req, body, store }) => {
      const session = await requireSession(req, store);

      const reportId = body?.id || body?.reportId;
      if (!reportId) {
        throw new ApiError(400, "invalid_request", "Missing report id.");
      }

      const values = body?.values || body;
      const imagePaths =
        body?.imagePaths ||
        (Array.isArray(body?.images) ? body.images.map((img) => img.path) : []);

      try {
        const publicSummary = buildPublicSummary(values);
        const result = await store.createReport({
          id: reportId,
          reporterId: session.user.id,
          kind: values.kind,
          municipality: values.municipality,
          barangay: values.barangay,
          landmark: values.landmark,
          publicLocationLabel: values.publicLocationLabel,
          publicSummary,
          latitude: values.latitude,
          longitude: values.longitude,
          description: values.description,
          contactPhone: values.contactPhone,
          severity: values.severity,
          need: values.need,
          peopleAffected: values.peopleAffected,
          imagePaths,
        });

        return {
          status: 200,
          body: { reportId: result.reportId },
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/reports/mine",
    handler: async ({ req, query, store, now }) => {
      const session = await requireSession(req, store);

      const limit = Math.min(Math.max(1, Number(query.get("pageSize") || 10)), 10);
      let cursor = null;
      const cursorCreatedAt = query.get("cursorCreatedAt");
      const cursorId = query.get("cursorId");
      if (cursorCreatedAt && cursorId) {
        cursor = { createdAt: cursorCreatedAt, id: cursorId };
      }

      try {
        const rows = await store.listMyReports(session.user.id, { cursor, limit });
        const currentTime = now ? now() : Date.now();
        const reports = rows.map((r) =>
          toPersonalReport(
            r.id,
            {
              kind: r.kind,
              municipality: r.municipality,
              barangay: r.barangay,
              landmark: r.landmark,
              publicLocationLabel: r.publicLocationLabel,
              description: r.description,
              severity: r.severity,
              need: r.need,
              peopleAffected: r.peopleAffected,
              verificationStatus: r.verificationStatus,
              incidentStatus: r.incidentStatus,
              createdAtMillis: r.createdAt ? Date.parse(r.createdAt) : null,
            },
            currentTime,
          ),
        );

        const last = rows[rows.length - 1];
        const nextCursor = last
          ? {
              createdAt:
                last.createdAtIso ||
                (last.createdAt instanceof Date ? last.createdAt.toISOString() : last.createdAt),
              id: last.id,
            }
          : null;

        return {
          status: 200,
          body: {
            reports,
            cursor: nextCursor,
            hasMore: rows.length === limit,
          },
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/reports/{id}/cancel",
    handler: async ({ req, params, store }) => {
      const session = await requireSession(req, store);

      try {
        await store.cancelReport(session.user.id, params.id);
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
];
