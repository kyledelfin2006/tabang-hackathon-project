import { INCIDENT_STATUS, isOverdue } from "../incidents/incidentLifecycle.js";

// Metrics older than this are labelled stale rather than presented as current.
export const METRIC_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Every metric this application is willing to display.
 *
 * A metric may only appear here if it can be counted from records the app
 * actually holds. Figures like "people affected" or "families evacuated" have
 * no source in this system, so they are absent by construction rather than
 * filtered out later - which is how the legacy dashboard ended up presenting
 * invented totals under a "Live" badge.
 */
export const METRIC_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "openIncidents",
    label: "Open incidents",
    description: "Reports that are not yet resolved or cancelled.",
    source: "Counted from the reports this deployment holds.",
  }),
  Object.freeze({
    key: "unclaimed",
    label: "Unclaimed",
    description: "Open incidents no responder has taken yet.",
    source: "Counted from the reports this deployment holds.",
  }),
  Object.freeze({
    key: "overdue",
    label: "Past acknowledgement target",
    description: "Unclaimed for longer than 15 minutes.",
    source: "Derived from each report's server-recorded creation time.",
  }),
  Object.freeze({
    key: "verified",
    label: "Verified incidents",
    description: "Open incidents a responder has confirmed.",
    source: "Counted from the reports this deployment holds.",
  }),
  Object.freeze({
    key: "awaitingVerification",
    label: "Awaiting verification",
    description: "Open incidents nobody has confirmed yet.",
    source: "Counted from the reports this deployment holds.",
  }),
]);

/**
 * Counts metrics from a bounded page of incidents.
 *
 * `truncated` matters: the queue is capped, so with more open incidents than
 * the page size these are counts of what was read, not totals. The dashboard
 * must say so rather than implying it counted everything.
 */
export function computeMetrics(incidents, { now = Date.now(), pageLimit } = {}) {
  const open = incidents.filter(
    (incident) =>
      incident.incidentStatus !== INCIDENT_STATUS.resolved &&
      incident.incidentStatus !== INCIDENT_STATUS.cancelled,
  );

  return Object.freeze({
    values: Object.freeze({
      openIncidents: open.length,
      unclaimed: open.filter((incident) => !incident.isClaimed).length,
      overdue: open.filter((incident) =>
        typeof incident.isOverdue === "boolean"
          ? incident.isOverdue
          : isOverdue(incident, now),
      ).length,
      verified: open.filter(
        (incident) => incident.verificationStatus === "verified",
      ).length,
      awaitingVerification: open.filter(
        (incident) => incident.verificationStatus !== "verified",
      ).length,
    }),
    generatedAtMillis: now,
    truncated: typeof pageLimit === "number" && incidents.length >= pageLimit,
  });
}

export function isMetricSetStale(generatedAtMillis, now = Date.now()) {
  return (
    generatedAtMillis === null || now - generatedAtMillis > METRIC_STALE_AFTER_MS
  );
}

/**
 * Describes the coverage of a metric set in plain words.
 *
 * Responders reading a dashboard during a flood need to know what the numbers
 * do and do not include before they act on them.
 */
export function describeCoverage({ truncated, pageLimit }) {
  return truncated
    ? `Counted from the first ${pageLimit} open incidents. There are more than this, so these are not totals.`
    : "Counted from every open incident in this deployment.";
}
