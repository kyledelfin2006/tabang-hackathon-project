import { rowToIncident } from "../../src/services/incidents/incidentRepository.js";
import { mapDatabaseError, requireRole, requireSession } from "./auth.mjs";
import { ApiError } from "../http.mjs";

const OPEN_STATUSES = ["new", "acknowledged", "dispatched", "on_scene"];
const RESPONDER_ROLES = ["responder", "reviewer", "admin"];

export const INCIDENT_ROUTES = [
  {
    method: "GET",
    path: "/api/app/incidents",
    handler: async ({ req, query, store, now }) => {
      await requireRole(req, store, RESPONDER_ROLES);

      const statusParam = query.get("status") || "open";
      const statuses = statusParam === "open" ? OPEN_STATUSES : [statusParam];
      const kind = query.get("kind") || "all";
      const limit = Math.min(Math.max(1, Number(query.get("pageSize") || 25)), 25);

      let cursor = null;
      const cursorCreatedAt = query.get("cursorCreatedAt");
      const cursorId = query.get("cursorId");
      if (cursorCreatedAt && cursorId) {
        cursor = { createdAt: cursorCreatedAt, id: cursorId };
      }

      try {
        const rows = await store.listIncidents({ statuses, kind, cursor, limit });
        const currentTime = now ? now() : Date.now();
        const incidents = rows.map((r) => rowToIncident(r, currentTime));

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
            incidents,
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
    method: "GET",
    path: "/api/app/incidents/counts",
    handler: async ({ req, store }) => {
      const session = await requireRole(req, store, ["responder", "admin"]);

      try {
        const counts = await store.getIncidentCounts(session.user.id);
        return {
          status: 200,
          body: {
            openIncidents: counts.openIncidents,
            unclaimed: counts.unclaimed,
            overdue: counts.overdue,
            verified: counts.verified,
            awaitingVerification: counts.awaitingVerification,
            countedAtMillis: counts.countedAt ? Date.parse(counts.countedAt) : Date.now(),
          },
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/incidents/{id}",
    handler: async ({ req, params, store, now }) => {
      const session = await requireSession(req, store);

      try {
        const incident = await store.getIncident(params.id);
        if (!incident) {
          throw new ApiError(404, "not_found", "The requested record was not found.");
        }

        const role = session.role || "resident";
        const isResponder = RESPONDER_ROLES.includes(role);
        const isReporter = incident.reporterId === session.user.id;

        if (!isResponder && !isReporter) {
          throw new ApiError(404, "not_found", "The requested record was not found.");
        }

        const currentTime = now ? now() : Date.now();
        return {
          status: 200,
          body: rowToIncident(incident, currentTime),
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/incidents/{id}/events",
    handler: async ({ req, params, store }) => {
      await requireRole(req, store, RESPONDER_ROLES);

      try {
        const rows = await store.listIncidentEvents(params.id);
        const events = rows.map((e) => ({
          id: String(e.id),
          type: e.type ?? "status-change",
          fromStatus: e.fromStatus ?? null,
          toStatus: e.toStatus ?? null,
          actorId: e.actorId ?? "",
          actorRole: e.actorRole ?? "",
          note: e.note ?? "",
          createdAtMillis: e.createdAt ? Date.parse(e.createdAt) : null,
        }));

        return {
          status: 200,
          body: events,
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/incidents/{id}/claim",
    handler: async ({ req, params, store }) => {
      const session = await requireRole(req, store, ["responder", "admin"]);

      try {
        await store.claimIncident(session.user.id, params.id);
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/incidents/{id}/transition",
    handler: async ({ req, params, body, store }) => {
      const session = await requireRole(req, store, RESPONDER_ROLES);
      const toStatus = body?.toStatus;
      const note = body?.note ?? "";

      if (!toStatus) {
        throw new ApiError(400, "invalid_request", "Missing toStatus.");
      }

      try {
        await store.transitionIncident(session.user.id, params.id, toStatus, note);
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/incidents/{id}/verify",
    handler: async ({ req, params, body, store }) => {
      const session = await requireRole(req, store, RESPONDER_ROLES);
      const verificationStatus = body?.verificationStatus;

      if (!["verified", "rejected"].includes(verificationStatus)) {
        throw new ApiError(400, "invalid_request", "Invalid verificationStatus.");
      }

      try {
        await store.verifyIncident(session.user.id, params.id, verificationStatus);
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
];
