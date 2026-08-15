import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import { STATUS_LABEL } from "../../components/incidents/statusLabels.js";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { allowedNextStatuses } from "../../services/incidents/incidentLifecycle.js";
import { createIncidentRepository } from "../../services/incidents/incidentRepository.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

export default function IncidentDetailPage({ incidentRepository }) {
  const { id } = useParams();
  const { user, role } = useAuth();
  const actorId = user?.uid;
  const repository = useMemo(
    () => incidentRepository ?? createIncidentRepository(),
    [incidentRepository],
  );

  const [incident, setIncident] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState(null);
  const [working, setWorking] = useState(false);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const [found, trail] = await Promise.all([
          repository.getIncident(id),
          repository.listEvents(id),
        ]);

        if (activeRef.current !== requestId) {
          return;
        }

        setIncident(found);
        setEvents(trail);
        setLoadState(found ? "ready" : "missing");
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("error");
        }
      }
    },
    [repository, id],
  );

  useEffect(() => {
    activeRef.current += 1;
    load(activeRef.current);

    return () => {
      activeRef.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => {
    activeRef.current += 1;
    setLoadState("loading");
    load(activeRef.current);
  }, [load]);

  async function advance(toStatus) {
    setWorking(true);
    setActionError(null);

    try {
      await repository.transitionIncident({
        incidentId: id,
        toStatus,
        actorId,
        actorRole: role,
        note,
      });
      setNote("");
      refresh();
    } catch (error) {
      setActionError(
        error?.message ?? "That change could not be recorded. Refresh and retry.",
      );
      refresh();
    } finally {
      setWorking(false);
    }
  }

  if (loadState === "loading") {
    return <Skeleton label="Loading the incident" lines={6} />;
  }

  if (loadState === "error") {
    return (
      <ErrorState
        title="The incident could not be loaded"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={refresh}
      />
    );
  }

  if (loadState === "missing") {
    return (
      <EmptyState
        title="That incident is not available"
        message="It may have been removed, or you may have followed an out-of-date link."
      />
    );
  }

  const nextStatuses = allowedNextStatuses(incident.incidentStatus);

  return (
    <>
      <Section
        id="incident"
        title={incident.publicLocationLabel || "Incident"}
        description="Contact details and the exact location are shown because you are handling this incident. They are not public."
      >
        <div className="surface-card">
          <div className="report-card__meta">
            <Badge tone={incident.kind === "flood" ? "warning" : "info"}>
              {incident.kind === "flood" ? "Flood" : "Help"}
            </Badge>
            <Badge tone="info">
              {STATUS_LABEL[incident.incidentStatus] ?? incident.incidentStatus}
            </Badge>
            {incident.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
          </div>

          <p className="report-card__body">{incident.description}</p>

          <div className="detail-list">
            <span>
              <strong>Contact</strong>
              <a href={`tel:${encodeURIComponent(incident.contactPhone)}`}>
                {incident.contactPhone}
              </a>
            </span>
            {incident.preciseLocation ? (
              <span>
                <strong>Coordinates</strong>
                {incident.preciseLocation.latitude},{" "}
                {incident.preciseLocation.longitude}
              </span>
            ) : null}
            <span>
              <strong>Reported</strong>
              {formatWhen(incident.createdAtMillis)}
            </span>
            <span>
              <strong>Acknowledged</strong>
              {formatWhen(incident.acknowledgedAtMillis)}
            </span>
            {incident.severity ? (
              <span>
                <strong>Water depth</strong>
                {incident.severity}
              </span>
            ) : null}
            {incident.need ? (
              <span>
                <strong>Needs</strong>
                {incident.need}
                {incident.peopleAffected
                  ? ` (${incident.peopleAffected} people)`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>
      </Section>

      <Section id="update" title="Record an update">
        <FormStatus message={actionError} />

        {nextStatuses.length === 0 ? (
          <p>
            This incident is closed. Its history is kept and cannot be changed.
          </p>
        ) : (
          <>
            <div className="form-field">
              <label className="form-field__label" htmlFor="incident-note">
                Note (optional)
              </label>
              <textarea
                className="form-field__input"
                id="incident-note"
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                value={note}
              />
            </div>

            <div className="button-row">
              {nextStatuses.map((next) => (
                <button
                  className="action-button"
                  disabled={working}
                  key={next}
                  onClick={() => advance(next)}
                  type="button"
                >
                  Mark {STATUS_LABEL[next]?.toLowerCase() ?? next}
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        id="history"
        title="Response history"
        description="Append-only. Entries carry server time and the account that made them."
      >
        {events.length === 0 ? (
          <EmptyState
            title="No entries yet"
            message="Claiming or updating this incident records an entry here."
          />
        ) : (
          <ol className="report-list">
            {events.map((event) => (
              <li className="report-card" key={event.id}>
                <div className="report-card__meta">
                  <Badge tone="neutral">{event.actorRole}</Badge>
                  <span>{formatWhen(event.createdAtMillis)}</span>
                </div>
                <p className="report-card__body">
                  {event.fromStatus} → {event.toStatus}
                </p>
                {event.note ? (
                  <p className="report-card__body">{event.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
