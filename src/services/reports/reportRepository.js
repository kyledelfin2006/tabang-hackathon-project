import { getApiClient } from "../http/apiClient.js";
import { toDataError, toMillis } from "../data/unwrap.js";
import { buildPublicSummary } from "./reportSchemas.js";

export const REPORT_PAGE_SIZE = 10;

// A report with no movement for this long is flagged as possibly out of date.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Cancellation is refused by the database once responders are acting on it.
const CANCELLABLE_STATUSES = new Set(["new", "acknowledged"]);

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
    municipality: raw.municipality ?? "",
    barangay: raw.barangay ?? "",
    landmark: raw.landmark ?? "",
    publicLocationLabel: raw.publicLocationLabel ?? "",
    description: raw.description ?? "",
    severity: raw.severity ?? null,
    need: raw.need ?? null,
    peopleAffected: raw.peopleAffected ?? null,
    verificationStatus: raw.verificationStatus ?? "pending",
    incidentStatus: raw.incidentStatus ?? "new",
    createdAtMillis,
    isCancelled: raw.incidentStatus === "cancelled",
    canCancel: CANCELLABLE_STATUSES.has(raw.incidentStatus ?? "new"),
    // Computed when the page is fetched rather than during render, so the
    // card stays a pure function of its props.
    isStale:
      createdAtMillis !== null &&
      now - createdAtMillis > STALE_AFTER_MS &&
      raw.incidentStatus !== "resolved" &&
      raw.incidentStatus !== "cancelled",
  });
}

export function rowToPersonalReport(row) {
  return toPersonalReport(row.id, {
    kind: row.kind,
    municipality: row.municipality,
    barangay: row.barangay,
    landmark: row.landmark,
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
    municipality: values.municipality,
    barangay: values.barangay,
    landmark: values.landmark || null,
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

export function createReportRepository({ client } = {}) {
  const api = () => client ?? getApiClient();

  return {
    /**
     * Creates a report at a caller-supplied id.
     *
     * The id is generated once per form session, so a double click, a retry
     * after a timeout, or a resubmit from a flaky connection all resolve to the
     * same row instead of filing the same emergency several times.
     */
    async submitReport({ reportId, values, images = [] }) {
      try {
        await api().post("/api/app/reports", {
          id: reportId,
          values,
          images,
        });

        return { reportId };
      } catch (err) {
        if (err.code === "23505") {
          return { reportId };
        }
        throw toDataError(err);
      }
    },

    /**
     * Lists the signed-in resident's own reports, one bounded page at a time.
     */
    async listMyReports(options = {}) {
      const spec = buildMyReportsQuerySpec(options);
      const query = {
        pageSize: spec.limit,
      };

      if (spec.cursor) {
        query.cursorCreatedAt = spec.cursor.createdAt;
        query.cursorId = spec.cursor.id;
      }

      const res = await api().get("/api/app/reports/mine", { query });

      return {
        reports: res.reports.map((r) =>
          toPersonalReport(r.id, {
            ...r,
            createdAtMillis: r.createdAtMillis ?? (r.createdAt ? toMillis(r.createdAt) : null),
          }),
        ),
        cursor: res.cursor,
        hasMore: res.hasMore,
      };
    },

    /**
     * Cancels a report instead of deleting it.
     */
    async cancelReport({ reportId }) {
      await api().post(`/api/app/reports/${reportId}/cancel`);
    },
  };
}
