import { getApiClient } from "../http/apiClient.js";
import { toMillis } from "../data/unwrap.js";
import { INCIDENT_STATUS, toIncident } from "./incidentLifecycle.js";

export const INCIDENT_PAGE_SIZE = 25;

const OPEN_STATUSES = Object.freeze([
  INCIDENT_STATUS.new,
  INCIDENT_STATUS.acknowledged,
  INCIDENT_STATUS.dispatched,
  INCIDENT_STATUS.onScene,
]);

/**
 * Describes the incident queue query without touching the database.
 *
 * Kept pure so the filters and the page cap can be asserted directly.
 */
export function buildIncidentQuerySpec({
  status = "open",
  kind = "all",
  cursor = null,
  pageSize = INCIDENT_PAGE_SIZE,
} = {}) {
  return Object.freeze({
    statuses: Object.freeze(status === "open" ? [...OPEN_STATUSES] : [status]),
    kind: kind === "all" ? null : kind,
    orderBy: Object.freeze([
      Object.freeze(["created_at", "asc"]),
      Object.freeze(["id", "asc"]),
    ]),
    limit: Math.min(Math.max(1, pageSize), INCIDENT_PAGE_SIZE),
    cursor,
  });
}

export function rowToIncident(row, now) {
  return toIncident(
    row.id,
    {
      kind: row.kind,
      incidentStatus: row.incident_status || row.incidentStatus,
      verificationStatus: row.verification_status || row.verificationStatus,
      priority: row.priority,
      municipality: row.municipality,
      barangay: row.barangay,
      landmark: row.landmark,
      publicLocationLabel: row.public_location_label || row.publicLocationLabel,
      description: row.description,
      contactPhone: row.contact_phone || row.contactPhone,
      preciseLocation:
        row.preciseLocation ||
        (row.latitude === null || row.longitude === null || row.latitude === undefined
          ? null
          : { latitude: row.latitude, longitude: row.longitude }),
      severity: row.severity,
      need: row.need,
      peopleAffected: row.people_affected || row.peopleAffected,
      imagePaths: row.image_paths || row.imagePaths,
      assignedResponderIds: row.assigned_responder_ids || row.assignedResponderIds,
      createdAtMillis: row.createdAtMillis ?? toMillis(row.created_at || row.createdAt),
      acknowledgedAtMillis: row.acknowledgedAtMillis ?? toMillis(row.acknowledged_at || row.acknowledgedAt),
    },
    now,
  );
}

export function createIncidentRepository({
  client,
  now = () => Date.now(),
} = {}) {
  const api = () => client ?? getApiClient();

  return {
    /**
     * One page of the queue, oldest first.
     */
    async listIncidents(options = {}) {
      const spec = buildIncidentQuerySpec(options);
      const query = {
        pageSize: spec.limit,
      };

      if (spec.statuses.length === 1) {
        query.status = spec.statuses[0];
      } else if (spec.statuses.length > 1) {
        query.status = "open";
      }

      if (spec.kind) {
        query.kind = spec.kind;
      }

      if (spec.cursor) {
        query.cursorCreatedAt = spec.cursor.createdAt;
        query.cursorId = spec.cursor.id;
      }

      const res = await api().get("/api/app/incidents", { query });

      return {
        incidents: res.incidents.map((r) => rowToIncident(r, now())),
        cursor: res.cursor,
        hasMore: res.hasMore,
      };
    },

    /**
     * Exact counts from the database, not from a page of rows.
     */
    async countIncidents() {
      const res = await api().get("/api/app/incidents/counts");

      return Object.freeze({
        openIncidents: res.openIncidents,
        unclaimed: res.unclaimed,
        overdue: res.overdue,
        verified: res.verified,
        awaitingVerification: res.awaitingVerification,
        countedAtMillis: res.countedAtMillis,
      });
    },

    async getIncident(incidentId) {
      try {
        const res = await api().get(`/api/app/incidents/${incidentId}`);
        return res ? rowToIncident(res, now()) : null;
      } catch (err) {
        if (err.status === 404 || err.code === "not_found") {
          return null;
        }
        throw err;
      }
    },

    /**
     * Reads the audit trail oldest first.
     */
    async listEvents(incidentId) {
      const rows = await api().get(`/api/app/incidents/${incidentId}/events`);

      return rows.map((row) =>
        Object.freeze({
          id: String(row.id),
          type: row.type ?? "status-change",
          fromStatus: row.fromStatus ?? row.from_status ?? null,
          toStatus: row.toStatus ?? row.to_status ?? null,
          actorId: row.actorId ?? row.actor_id ?? "",
          actorRole: row.actorRole ?? row.actor_role ?? "",
          note: row.note ?? "",
          createdAtMillis: row.createdAtMillis ?? toMillis(row.createdAt || row.created_at),
        }),
      );
    },

    /**
     * Claims an incident for the signed-in responder.
     */
    async claimIncident({ incidentId }) {
      await api().post(`/api/app/incidents/${incidentId}/claim`);
    },

    /**
     * Advances an incident and appends the matching audit event.
     */
    async transitionIncident({ incidentId, toStatus, note }) {
      await api().post(`/api/app/incidents/${incidentId}/transition`, {
        toStatus,
        note: note ?? "",
      });
    },

    /** Records `verified` or `rejected`; the database records who and when. */
    async verifyIncident({ incidentId, verificationStatus }) {
      await api().post(`/api/app/incidents/${incidentId}/verify`, {
        verificationStatus,
      });
    },

    /**
     * Expiring or authenticated links to the report's private photos.
     */
    async getPhotoUrls(imagePaths = []) {
      if (!imagePaths || imagePaths.length === 0) {
        return [];
      }

      return imagePaths.map((path) => (path ? `/api/app/files/report-photos/${path}` : null));
    },
  };
}
