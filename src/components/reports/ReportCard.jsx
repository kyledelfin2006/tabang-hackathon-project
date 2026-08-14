import { Badge } from "../ui/Primitives.jsx";

const VERIFICATION_TONE = {
  verified: "success",
  rejected: "danger",
  pending: "neutral",
};

const INCIDENT_TONE = {
  new: "warning",
  acknowledged: "info",
  dispatched: "info",
  on_scene: "info",
  resolved: "success",
  cancelled: "neutral",
};

const INCIDENT_LABEL = {
  new: "Awaiting response",
  acknowledged: "Acknowledged",
  dispatched: "Responders dispatched",
  on_scene: "Responders on scene",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

/**
 * One card, two variants.
 *
 * The `public` variant renders only fields that are safe for anyone to see. It
 * deliberately has no branch that can display a description, a phone number, or
 * coordinates, so a caller cannot pass protected data into the public feed by
 * mistake.
 */
export default function ReportCard({ report, variant = "personal", onCancel }) {
  const isPersonal = variant === "personal";
  // Staleness is computed at fetch time so this component stays pure.
  const isStale = Boolean(report.isStale);

  return (
    <li className="report-card">
      <div className="report-card__meta">
        <Badge tone={report.kind === "flood" ? "warning" : "info"}>
          {report.kind === "flood" ? "Flood" : "Help"}
        </Badge>

        {isPersonal ? (
          <>
            <Badge tone={INCIDENT_TONE[report.incidentStatus] ?? "neutral"}>
              {INCIDENT_LABEL[report.incidentStatus] ?? report.incidentStatus}
            </Badge>
            <Badge
              tone={VERIFICATION_TONE[report.verificationStatus] ?? "neutral"}
            >
              {report.verificationStatus === "pending"
                ? "Not yet verified"
                : report.verificationStatus}
            </Badge>
          </>
        ) : (
          <Badge tone="success">Verified</Badge>
        )}

        {isStale ? <Badge tone="warning">No update in 24h</Badge> : null}
      </div>

      <h4 className="report-card__title">
        {isPersonal ? report.publicLocationLabel : report.barangay}
      </h4>

      <p className="report-card__body">
        {isPersonal ? report.description : report.summary}
      </p>

      <p className="report-card__time">{formatWhen(report.createdAtMillis)}</p>

      {isPersonal && onCancel && !report.isCancelled ? (
        <div className="button-row">
          <button
            className="action-button action-button--secondary"
            onClick={() => onCancel(report)}
            type="button"
          >
            Cancel this report
          </button>
        </div>
      ) : null}
    </li>
  );
}
