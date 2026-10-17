import { getSupabaseClient } from "../../config/supabase.js";
import { toMillis, unwrap } from "../data/unwrap.js";
import { INCIDENT_STATUS, toIncident } from "./incidentLifecycle.js";

export const INCIDENT_PAGE_SIZE = 25;

// Signed photo links last long enough to look at an incident, not to share.
const PHOTO_LINK_SECONDS = 10 * 60;

const OPEN_STATUSES = Object.freeze([
  INCIDENT_STATUS.new,
  INCIDENT_STATUS.acknowledged,
  INCIDENT_STATUS.dispatched,
  INCIDENT_STATUS.onScene,
]);

const INCIDENT_COLUMNS =
  "id, kind, incident_status, verification_status, priority, municipality, barangay, landmark, public_location_label, description, contact_phone, latitude, longitude, severity, need, people_affected, image_paths, assigned_responder_ids, created_at, acknowledged_at";

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
      incidentStatus: row.incident_status,
      verificationStatus: row.verification_status,
      priority: row.priority,
      municipality: row.municipality,
      barangay: row.barangay,
      landmark: row.landmark,
      publicLocationLabel: row.public_location_label,
      description: row.description,
      contactPhone: row.contact_phone,
      preciseLocation:
        row.latitude === null || row.longitude === null
          ? null
          : { latitude: row.latitude, longitude: row.longitude },
      severity: row.severity,
      need: row.need,
      peopleAffected: row.people_affected,
      imagePaths: row.image_paths,
      assignedResponderIds: row.assigned_responder_ids,
      createdAtMillis: toMillis(row.created_at),
      acknowledgedAtMillis: toMillis(row.acknowledged_at),
    },
    now,
  );
}

export function createIncidentRepository({
  client,
  now = () => Date.now(),
} = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    /**
     * One page of the queue, oldest first.
     *
     * The cursor carries the last row's created_at and id, so a page boundary
     * never skips or repeats an incident even when two share a timestamp.
     */
    async listIncidents(options = {}) {
      const spec = buildIncidentQuerySpec(options);
      let query = supabase()
        .from("reports")
        .select(INCIDENT_COLUMNS)
        .in("incident_status", spec.statuses);

      if (spec.kind) {
        query = query.eq("kind", spec.kind);
      }

      if (spec.cursor) {
        // Quoted, because a timestamp contains characters the filter syntax
        // otherwise treats as separators.
        const createdAt = `"${spec.cursor.createdAt}"`;

        query = query.or(
          `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${spec.cursor.id})`,
        );
      }

      for (const [column, direction] of spec.orderBy) {
        query = query.order(column, { ascending: direction === "asc" });
      }

      const rows = unwrap(await query.limit(spec.limit));
      const clock = now();
      const last = rows[rows.length - 1];

      return {
        incidents: rows.map((row) => rowToIncident(row, clock)),
        cursor: last ? { createdAt: last.created_at, id: last.id } : null,
        hasMore: rows.length === spec.limit,
      };
    },

    /**
     * Exact counts from the database, not from a page of rows, so the
     * dashboard never presents a partial count as a total.
     */
    async countIncidents() {
      const [counts] = unwrap(await supabase().rpc("incident_counts"));

      return Object.freeze({
        openIncidents: counts.open_incidents,
        unclaimed: counts.unclaimed,
        overdue: counts.overdue,
        verified: counts.verified,
        awaitingVerification: counts.awaiting_verification,
        countedAtMillis: toMillis(counts.counted_at),
      });
    },

    async getIncident(incidentId) {
      const row = unwrap(
        await supabase()
          .from("reports")
          .select(INCIDENT_COLUMNS)
          .eq("id", incidentId)
          .maybeSingle(),
      );

      return row ? rowToIncident(row, now()) : null;
    },

    /**
     * Reads the audit trail oldest first.
     *
     * Events are append-only and carry server time, so this is the record of
     * what actually happened rather than a reconstruction.
     */
    async listEvents(incidentId) {
      const rows = unwrap(
        await supabase()
          .from("report_events")
          .select(
            "id, type, from_status, to_status, actor_id, actor_role, note, created_at",
          )
          .eq("report_id", incidentId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(100),
      );

      return rows.map((row) =>
        Object.freeze({
          id: String(row.id),
          type: row.type ?? "status-change",
          fromStatus: row.from_status ?? null,
          toStatus: row.to_status ?? null,
          actorId: row.actor_id ?? "",
          actorRole: row.actor_role ?? "",
          note: row.note ?? "",
          createdAtMillis: toMillis(row.created_at),
        }),
      );
    },

    /**
     * Claims an incident for the signed-in responder.
     *
     * The database function locks the row, so two responders pressing claim at
     * the same moment cannot both succeed: the second gets `already_claimed`
     * rather than silently replacing the first. Silent overwrites are how two
     * teams end up believing the other one went.
     */
    async claimIncident({ incidentId }) {
      unwrap(await supabase().rpc("claim_incident", { report_id: incidentId }));
    },

    /**
     * Advances an incident and appends the matching audit event. From `new`,
     * acknowledging is a claim. The function re-checks the stored status, so a
     * stale screen cannot push an incident through a step it already passed.
     */
    async transitionIncident({ incidentId, toStatus, note }) {
      unwrap(
        await supabase().rpc("transition_incident", {
          report_id: incidentId,
          to_status: toStatus,
          note: note ?? "",
        }),
      );
    },

    /** Records `verified` or `rejected`; the database records who and when. */
    async verifyIncident({ incidentId, verificationStatus }) {
      unwrap(
        await supabase().rpc("verify_incident", {
          report_id: incidentId,
          verification_status: verificationStatus,
        }),
      );
    },

    /**
     * Expiring links to the report's private photos, in the same order. A
     * photo that cannot be signed comes back as null rather than failing the
     * others.
     */
    async getPhotoUrls(imagePaths = []) {
      if (imagePaths.length === 0) {
        return [];
      }

      const signed = unwrap(
        await supabase()
          .storage.from("report-photos")
          .createSignedUrls(imagePaths, PHOTO_LINK_SECONDS),
      );

      return imagePaths.map(
        (path) =>
          signed.find((entry) => entry.path === path && !entry.error)
            ?.signedUrl ?? null,
      );
    },
  };
}
