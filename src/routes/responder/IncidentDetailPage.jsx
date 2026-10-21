import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { describeActionError } from "../../services/errors/describeActionError.js";
import {
  INCIDENT_STATUS,
  ROLE_LABELS,
  STATUS_LABELS,
  VERIFICATION_LABELS,
  allowedNextStatuses,
} from "../../services/incidents/incidentLifecycle.js";
import { createIncidentRepository } from "../../services/incidents/incidentRepository.js";
import {
  NEED_LABELS,
  SEVERITY_LABELS,
} from "../../services/reports/reportSchemas.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

function mapLink({ latitude, longitude }) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function actionLabel(fromStatus, toStatus) {
  return fromStatus === INCIDENT_STATUS.new &&
    toStatus === INCIDENT_STATUS.acknowledged
    ? "Acknowledge and claim"
    : `Mark ${STATUS_LABELS[toStatus]?.toLowerCase() ?? toStatus}`;
}

function describeEvent(event) {
  const labels =
    event.type === "verification" ? VERIFICATION_LABELS : STATUS_LABELS;
  const change = `${labels[event.fromStatus] ?? event.fromStatus ?? "Start"} to ${labels[event.toStatus] ?? event.toStatus}`;

  return event.type === "verification" ? `Verification: ${change}` : change;
}

export default function IncidentDetailPage({ incidentRepository }) {
  const { id } = useParams();
  const { isReviewer, user } = useAuth();
  const repository = useMemo(
    () => incidentRepository ?? createIncidentRepository(),
    [incidentRepository],
  );

  const [incident, setIncident] = useState(null);
  const [events, setEvents] = useState([]);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [failedImages, setFailedImages] = useState(() => new Set());
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

        if (found?.imagePaths?.length > 0) {
          const urls = await repository.getPhotoUrls(found.imagePaths);

          if (activeRef.current === requestId) {
            setPhotoUrls(urls);
          }
        }
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
      await repository.transitionIncident({ incidentId: id, toStatus, note });
      setNote("");
      refresh();
    } catch (error) {
      setActionError(describeActionError(error));
      refresh();
    } finally {
      setWorking(false);
    }
  }

  async function verify(verificationStatus) {
    setWorking(true);
    setActionError(null);

    try {
      await repository.verifyIncident({ incidentId: id, verificationStatus });
      refresh();
    } catch (error) {
      setActionError(describeActionError(error));
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
  // The database is the boundary; this only avoids offering a refused action.
  const canAct =
    isReviewer || incident.assignedResponderIds.includes(user?.uid);

  return (
    <>
      <Section
        id="incident"
        title="Report details"
        description="Contact details and the exact location are shown because you are handling this incident. They are not public."
      >
        <div className="surface-card">
          <div className="report-card__meta">
            <Badge tone={incident.kind === "flood" ? "warning" : "info"}>
              {incident.kind === "flood" ? "Flood" : "Help"}
            </Badge>
            <Badge tone="info">
              {STATUS_LABELS[incident.incidentStatus] ??
                incident.incidentStatus}
            </Badge>
            <Badge tone="neutral">
              {VERIFICATION_LABELS[incident.verificationStatus] ??
                incident.verificationStatus}
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
            <span>
              <strong>Place</strong>
              {incident.publicLocationLabel}
              {incident.landmark ? ` (near ${incident.landmark})` : ""}
            </span>
            {incident.preciseLocation ? (
              <span>
                <strong>Map</strong>
                <a
                  href={mapLink(incident.preciseLocation)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open the reported location in Google Maps
                </a>
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
                {SEVERITY_LABELS[incident.severity] ?? incident.severity}
              </span>
            ) : null}
            {incident.need ? (
              <span>
                <strong>Needs</strong>
                {NEED_LABELS[incident.need] ?? incident.need}
                {incident.peopleAffected
                  ? ` (${incident.peopleAffected} people)`
                  : ""}
              </span>
            ) : null}
          </div>

          {photoUrls.length > 0 ? (
            <ul className="photo-grid">
              {photoUrls.map((url, index) =>
                url && !failedImages.has(url) ? (
                  <li key={url}>
                    <a href={url} rel="noopener noreferrer" target="_blank">
                      <img
                        alt={`Photo ${index + 1} sent with the report`}
                        onError={() =>
                          setFailedImages((current) => new Set(current).add(url))
                        }
                        src={url}
                      />
                    </a>
                  </li>
                ) : (
                  <li key={`missing-${index}`}>
                    Photo unavailable
                  </li>
                ),
              )}
            </ul>
          ) : null}
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
                  {actionLabel(incident.incidentStatus, next)}
                </button>
              ))}
            </div>
          </>
        )}

        {canAct && incident.incidentStatus !== INCIDENT_STATUS.new ? (
          <div className="button-row">
            <button
              className="action-button action-button--secondary"
              disabled={working || incident.verificationStatus === "verified"}
              onClick={() => verify("verified")}
              type="button"
            >
              Verify
            </button>
            <button
              className="action-button action-button--secondary"
              disabled={working || incident.verificationStatus === "rejected"}
              onClick={() => verify("rejected")}
              type="button"
            >
              Reject
            </button>
          </div>
        ) : null}
      </Section>

      <Section
        id="history"
        title="Response history"
        description="Updates are kept as a history and show who recorded them."
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
                  <Badge tone="neutral">
                    {ROLE_LABELS[event.actorRole] ?? event.actorRole}
                  </Badge>
                  <span>{formatWhen(event.createdAtMillis)}</span>
                </div>
                <p className="report-card__body">{describeEvent(event)}</p>
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
