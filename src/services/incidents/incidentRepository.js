import { getSupabaseClient } from "../../config/supabase.js";
import { toDataError, toMillis, unwrap } from "../data/unwrap.js";
import { INCIDENT_STATUS, toIncident } from "./incidentLifecycle.js";

export const INCIDENT_PAGE_SIZE = 25;

const OPEN_STATUSES = Object.freeze([
  INCIDENT_STATUS.new,
  INCIDENT_STATUS.acknowledged,
  INCIDENT_STATUS.dispatched,
  INCIDENT_STATUS.onScene,
]);

const INCIDENT_COLUMNS =
  "id, kind, incident_status, verification_status, priority, public_location_label, description, contact_phone, latitude, longitude, severity, need, people_affected, assigned_responder_ids, created_at, acknowledged_at";

/**
 * Describes the incident queue query without touching the database.
 *
 * Kept pure so the filters and the page cap can be asserted directly.
 */
export function buildIncidentQuerySpec({
  status = "open",
  kind = "all",
  pageSize = INCIDENT_PAGE_SIZE,
} = {}) {
  return Object.freeze({
    statuses: Object.freeze(
      status === "open" ? [...OPEN_STATUSES] : [status],
    ),
    kind: kind === "all" ? null : kind,
    orderBy: Object.freeze([
      Object.freeze(["created_at", "asc"]),
      Object.freeze(["id", "asc"]),
    ]),
    limit: Math.min(Math.max(1, pageSize), INCIDENT_PAGE_SIZE),
  });
}

export class TransitionError extends Error {}
export class AlreadyClaimedError extends Error {}

export function rowToIncident(row, now) {
  return toIncident(
    row.id,
    {
      kind: row.kind,
      incidentStatus: row.incident_status,
      verificationStatus: row.verification_status,
      priority: row.priority,
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
      assignedResponderIds: row.assigned_responder_ids,
      createdAtMillis: toMillis(row.created_at),
      acknowledgedAtMillis: toMillis(row.acknowledged_at),
    },
    now,
  );
}

// The database function decides; this only gives its answer a type the
// screens already recognise.
function toIncidentError(error) {
  if (error?.message === "already_claimed") {
    return new AlreadyClaimedError(
      "Another responder has already claimed this incident.",
    );
  }

  if (error?.message === "not_found") {
    return new TransitionError("That incident no longer exists.");
  }

  if (error?.message === "invalid_transition") {
    return new TransitionError("That incident cannot make this change now.");
  }

  return toDataError(error);
}

export function createIncidentRepository({ client, now = () => Date.now() } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    async listIncidents(options = {}) {
      const spec = buildIncidentQuerySpec(options);
      let query = supabase()
        .from("reports")
        .select(INCIDENT_COLUMNS)
        .in("incident_status", spec.statuses);

      if (spec.kind) {
        query = query.eq("kind", spec.kind);
      }

      for (const [column, direction] of spec.orderBy) {
        query = query.order(column, { ascending: direction === "asc" });
      }

      const rows = unwrap(await query.limit(spec.limit));
      const clock = now();

      return rows.map((row) => rowToIncident(row, clock));
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
          .select("id, type, from_status, to_status, actor_id, actor_role, note, created_at")
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
     * the same moment cannot both succeed: the second is told who holds it
     * rather than silently replacing them. Silent overwrites are how two teams
     * end up believing the other one went.
     */
    async claimIncident({ incidentId }) {
      const { error } = await supabase().rpc("claim_incident", {
        report_id: incidentId,
      });

      if (error) {
        throw toIncidentError(error);
      }
    },

    /**
     * Advances an incident and appends the matching audit event.
     *
     * The function re-checks the stored status, so a stale screen cannot push
     * an incident through a step it has already passed.
     */
    async transitionIncident({ incidentId, toStatus, note }) {
      const { error } = await supabase().rpc("transition_incident", {
        report_id: incidentId,
        to_status: toStatus,
        note: note ?? "",
      });

      if (error) {
        throw toIncidentError(error);
      }
    },
  };
}
