import { ApiError } from "../http.mjs";
import { decodeCursor, pageOf, parseLimit } from "../paging.mjs";
import { AKLAN_MUNICIPALITIES } from "../../src/services/places/aklanPlaces.js";

const OPEN_STATUSES = ["new", "acknowledged", "dispatched", "on_scene"];
const STATUSES = [...OPEN_STATUSES, "resolved", "cancelled"];

/**
 * The only incident fields a partner ever receives (D-5).
 *
 * Built field by field from a fixed list, so a wider row from the store can
 * never leak a contact number, description, coordinates, landmark, photos, or
 * the reporter, until a data sharing agreement says otherwise.
 */
export function toPartnerIncident(row) {
  return {
    id: row.id,
    kind: row.kind,
    incidentStatus: row.incidentStatus,
    verificationStatus: row.verificationStatus,
    severity: row.severity ?? null,
    need: row.need ?? null,
    peopleAffected: row.peopleAffected ?? null,
    municipality: row.municipality,
    barangay: row.barangay,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    acknowledgedAt: row.acknowledgedAt ?? null,
    resolvedAt: row.resolvedAt ?? null,
  };
}

function parseFilters(query) {
  const status = query.get("status") ?? "open";
  const kind = query.get("kind");
  const municipality = query.get("municipality");
  const since = query.get("since");

  if (status !== "open" && !STATUSES.includes(status)) {
    throw new ApiError(
      400,
      "invalid_request",
      `status must be open or one of ${STATUSES.join(", ")}.`,
    );
  }

  if (kind !== null && kind !== "flood" && kind !== "help") {
    throw new ApiError(400, "invalid_request", "kind must be flood or help.");
  }

  if (municipality !== null && !AKLAN_MUNICIPALITIES.includes(municipality)) {
    throw new ApiError(
      400,
      "invalid_request",
      "municipality must be an Aklan municipality.",
    );
  }

  if (since !== null && Number.isNaN(Date.parse(since))) {
    throw new ApiError(400, "invalid_request", "since must be an ISO 8601 timestamp.");
  }

  return {
    statuses: status === "open" ? OPEN_STATUSES : [status],
    kind,
    municipality,
    since,
  };
}

export const incidentRoutes = [
  {
    method: "GET",
    path: "/api/v1/incidents",
    scope: "incidents:read",
    // Oldest change first, so a partner polling with `since` catches up in
    // order and resumes from the last cursor.
    async handler({ query, store }) {
      const limit = parseLimit(query);
      const rows = await store.listPartnerIncidents({
        ...parseFilters(query),
        after: decodeCursor(query),
        limit: limit + 1,
      });
      const { page, nextCursor } = pageOf(rows, limit, (row) => [
        row.updatedAt,
        row.id,
      ]);

      return { body: { data: page.map(toPartnerIncident), nextCursor } };
    },
  },
  {
    method: "GET",
    path: "/api/v1/incidents/{id}",
    scope: "incidents:read",
    async handler({ params, store }) {
      const row = /^[0-9a-f-]{36}$/.test(params.id)
        ? await store.getPartnerIncident(params.id)
        : null;

      if (!row) {
        throw new ApiError(404, "not_found", "There is no incident with that id.");
      }

      return { body: { data: toPartnerIncident(row) } };
    },
  },
];
