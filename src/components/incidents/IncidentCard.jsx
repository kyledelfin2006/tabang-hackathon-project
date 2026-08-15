import { Link } from "react-router-dom";
import { Badge } from "../ui/Primitives.jsx";
import { STATUS_LABEL, STATUS_TONE } from "./statusLabels.js";

export default function IncidentCard({ incident, onClaim, claiming }) {
  return (
    <li className="report-card">
      <div className="report-card__meta">
        <Badge tone={incident.kind === "flood" ? "warning" : "info"}>
          {incident.kind === "flood" ? "Flood" : "Help"}
        </Badge>
        <Badge tone={STATUS_TONE[incident.incidentStatus] ?? "neutral"}>
          {STATUS_LABEL[incident.incidentStatus] ?? incident.incidentStatus}
        </Badge>
        {incident.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
        {incident.waitingFor ? (
          <span>Waiting {incident.waitingFor}</span>
        ) : null}
      </div>

      <h4 className="report-card__title">{incident.publicLocationLabel}</h4>
      <p className="report-card__body">{incident.description}</p>

      <div className="button-row">
        <Link
          className="action-button action-button--secondary"
          to={`/responder/incidents/${incident.id}`}
        >
          Open incident
        </Link>

        {/* Claiming is only offered while nobody holds it. The transaction is
            what actually prevents a race; this just avoids inviting one. */}
        {!incident.isClaimed && onClaim ? (
          <button
            className="action-button"
            disabled={claiming}
            onClick={() => onClaim(incident)}
            type="button"
          >
            {claiming ? "Claiming…" : "Claim"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
