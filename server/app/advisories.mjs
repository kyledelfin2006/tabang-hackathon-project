import { toPublicAdvisory } from "../../src/services/advisories/advisoryRepository.js";
import { mapDatabaseError, requireRole } from "./auth.mjs";
import { ApiError } from "../http.mjs";

export const ADVISORY_ROUTES = [
  {
    method: "GET",
    path: "/api/app/advisories",
    handler: async ({ query, store }) => {
      const pageSize = Math.min(Math.max(1, Number(query.get("pageSize") || 6)), 6);

      try {
        const rows = await store.listPublicFeed({ limit: pageSize });
        const advisories = rows.map((r) =>
          toPublicAdvisory(r.id, {
            summary: r.summary,
            barangay: r.barangay,
            municipality: r.municipality,
            source: r.source,
            kind: r.kind,
            createdAtMillis: r.createdAt ? Date.parse(r.createdAt) : null,
            expiresAtMillis: r.expiresAt ? Date.parse(r.expiresAt) : null,
          }),
        );

        return { status: 200, body: advisories };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/advisories/mine",
    handler: async ({ req, store }) => {
      const session = await requireRole(req, store, ["responder", "admin"]);

      try {
        const rows = await store.listOwnAdvisories(session.user.id, { limit: 20 });
        const advisories = rows.map((r) => ({
          ...toPublicAdvisory(r.id, {
            summary: r.summary,
            barangay: r.barangay,
            municipality: r.municipality,
            source: r.source,
            kind: r.kind,
            createdAtMillis: r.createdAt ? Date.parse(r.createdAt) : null,
            expiresAtMillis: r.expiresAt ? Date.parse(r.expiresAt) : null,
          }),
          published: r.published,
        }));

        return { status: 200, body: advisories };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/advisories",
    handler: async ({ req, body, store }) => {
      const session = await requireRole(req, store, ["responder", "admin"]);
      const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
      if (!summary || summary.length > 240) {
        throw new ApiError(400, "invalid_request", "Summary must be between 1 and 240 characters.");
      }

      try {
        await store.createAdvisory(session.user.id, {
          summary,
          municipality: body?.municipality || null,
          barangay: body?.barangay || null,
        });

        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/advisories/{id}/unpublish",
    handler: async ({ req, params, store }) => {
      const session = await requireRole(req, store, ["responder", "admin"]);

      try {
        const unpublished = await store.unpublishAdvisory(session.user.id, params.id);
        if (!unpublished) {
          throw new ApiError(404, "not_found", "Advisory not found.");
        }
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
];
