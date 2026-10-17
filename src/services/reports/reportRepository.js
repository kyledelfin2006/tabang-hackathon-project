import { getSupabaseClient } from "../../config/supabase.js";
import { toDataError, toMillis, unwrap } from "../data/unwrap.js";
import { buildPublicSummary } from "./reportSchemas.js";

export const REPORT_PAGE_SIZE = 10;

// A report with no movement for this long is flagged as possibly out of date.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const PERSONAL_COLUMNS =
  "id, kind, public_location_label, description, severity, need, people_affected, verification_status, incident_status, created_at";

/**
 * Describes the personal report query without touching the database.
 *
 * Keeping this pure means the parts that actually matter for correctness - the
 * owner filter, the deterministic ordering, and the page cap - can be asserted
 * directly.
 */
export function buildMyReportsQuerySpec({
  reporterId,
  cursor = null,
  pageSize = REPORT_PAGE_SIZE,
} = {}) {
  return Object.freeze({
    reporterId,
    // created_at alone is not unique: two reports filed in the same instant
    // would have an unstable order, letting a page boundary duplicate or skip.
    orderBy: Object.freeze([
      Object.freeze(["created_at", "desc"]),
      Object.freeze(["id", "desc"]),
    ]),
    limit: Math.min(Math.max(1, pageSize), REPORT_PAGE_SIZE),
    cursor,
  });
}

/**
 * The resident's own view of one of their reports.
 *
 * Built from an owner-scoped query, so it may include the protected fields the
 * resident themselves supplied. It must never be reused for the public feed.
 * Takes plain values: timestamps are milliseconds.
 */
export function toPersonalReport(id, raw = {}, now = Date.now()) {
  const createdAtMillis = Number.isFinite(raw.createdAtMillis)
    ? raw.createdAtMillis
    : null;

  return Object.freeze({
    id,
    kind: raw.kind === "help" ? "help" : "flood",
    publicLocationLabel: raw.publicLocationLabel ?? "",
    description: raw.description ?? "",
    severity: raw.severity ?? null,
    need: raw.need ?? null,
    peopleAffected: raw.peopleAffected ?? null,
    verificationStatus: raw.verificationStatus ?? "pending",
    incidentStatus: raw.incidentStatus ?? "new",
    createdAtMillis,
    isCancelled: raw.incidentStatus === "cancelled",
    // Computed when the page is fetched rather than during render, so the
    // card stays a pure function of its props.
    isStale:
      createdAtMillis !== null &&
      now - createdAtMillis > STALE_AFTER_MS &&
      raw.incidentStatus !== "resolved" &&
      raw.incidentStatus !== "cancelled",
  });
}

function rowToPersonalReport(row) {
  return toPersonalReport(row.id, {
    kind: row.kind,
    publicLocationLabel: row.public_location_label,
    description: row.description,
    severity: row.severity,
    need: row.need,
    peopleAffected: row.people_affected,
    verificationStatus: row.verification_status,
    incidentStatus: row.incident_status,
    createdAtMillis: toMillis(row.created_at),
  });
}

/**
 * Assembles the row a resident may insert.
 *
 * Priority, statuses, assignment, the reporter, and timestamps are absent: the
 * database grants no insert on them, so they take server defaults and a device
 * with a wrong clock cannot reorder an incident queue. The precise location
 * and contact number are protected columns and never reach the public summary.
 */
export function buildReportRow({ reportId, values, imagePaths = [] }) {
  const hasLocation =
    Number.isFinite(values.latitude) && Number.isFinite(values.longitude);
  const base = {
    id: reportId,
    kind: values.kind,
    public_location_label: values.publicLocationLabel,
    public_summary: buildPublicSummary(values),
    latitude: hasLocation ? values.latitude : null,
    longitude: hasLocation ? values.longitude : null,
    description: values.description,
    contact_phone: values.contactPhone,
    image_paths: imagePaths,
  };

  return values.kind === "flood"
    ? { ...base, severity: values.severity }
    : { ...base, need: values.need, people_affected: values.peopleAffected };
}

// Postgres reports a reused primary key as a unique violation.
const DUPLICATE_KEY = "23505";

export function createReportRepository({ client } = {}) {
  const supabase = () => client ?? getSupabaseClient();

  return {
    /**
     * Creates a report at a caller-supplied id.
     *
     * The id is generated once per form session, so a double click, a retry
     * after a timeout, or a resubmit from a flaky connection all resolve to the
     * same row instead of filing the same emergency several times. A row the
     * caller cannot see would also collide, but ids are random UUIDs, so a
     * collision means an earlier attempt by this resident already landed.
     */
    async submitReport({ reportId, values, images = [] }) {
      const { error } = await supabase()
        .from("reports")
        .insert(
          buildReportRow({
            reportId,
            values,
            imagePaths: images.map((image) => image.path),
          }),
        );

      if (error && error.code !== DUPLICATE_KEY) {
        throw toDataError(error);
      }

      return { reportId };
    },

    /**
     * Lists the signed-in resident's own reports, one bounded page at a time.
     *
     * The query is restricted by reporter rather than filtered in the client,
     * so another resident's record is never fetched in the first place. Pages
     * continue from the last row's created_at and id, which is deterministic
     * even when two reports share a timestamp.
     */
    async listMyReports(options = {}) {
      const spec = buildMyReportsQuerySpec(options);
      let query = supabase()
        .from("reports")
        .select(PERSONAL_COLUMNS)
        .eq("reporter_id", spec.reporterId);

      if (spec.cursor) {
        // Quoted, because a timestamp contains characters the filter syntax
        // otherwise treats as separators.
        const createdAt = `"${spec.cursor.createdAt}"`;

        query = query.or(
          `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${spec.cursor.id})`,
        );
      }

      for (const [column, direction] of spec.orderBy) {
        query = query.order(column, { ascending: direction === "asc" });
      }

      const rows = unwrap(await query.limit(spec.limit));
      const last = rows[rows.length - 1];

      return {
        reports: rows.map(rowToPersonalReport),
        cursor: last ? { createdAt: last.created_at, id: last.id } : null,
        hasMore: rows.length === spec.limit,
      };
    },

    /**
     * Cancels a report instead of deleting it.
     *
     * An emergency record that responders may already have acted on must not
     * vanish, so the row and its event history are retained and only the
     * incident status changes, through a function that checks the reporter and
     * the current status together.
     */
    async cancelReport({ reportId }) {
      unwrap(await supabase().rpc("cancel_report", { report_id: reportId }));
    },
  };
}
