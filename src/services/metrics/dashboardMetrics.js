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

export function isMetricSetStale(generatedAtMillis, now = Date.now()) {
  return (
    generatedAtMillis === null || now - generatedAtMillis > METRIC_STALE_AFTER_MS
  );
}
