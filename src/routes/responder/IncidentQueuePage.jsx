import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import IncidentCard from "../../components/incidents/IncidentCard.jsx";
import { Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { createIncidentRepository } from "../../services/incidents/incidentRepository.js";

const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "new", label: "Unclaimed" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "dispatched", label: "Dispatched" },
  { value: "on_scene", label: "On scene" },
  { value: "resolved", label: "Resolved" },
];

const KIND_FILTERS = [
  { value: "all", label: "All kinds" },
  { value: "flood", label: "Flood" },
  { value: "help", label: "Help" },
];

export default function IncidentQueuePage({ incidentRepository }) {
  const { user, role } = useAuth();
  const responderId = user?.uid;
  const repository = useMemo(
    () => incidentRepository ?? createIncidentRepository(),
    [incidentRepository],
  );

  const [incidents, setIncidents] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("all");
  const [claimingId, setClaimingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const results = await repository.listIncidents({ status, kind });

        if (activeRef.current !== requestId) {
          return;
        }

        setIncidents(results);
        setLoadState("ready");
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("error");
        }
      }
    },
    [repository, status, kind],
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

  async function claim(incident) {
    setClaimingId(incident.id);
    setActionError(null);

    try {
      await repository.claimIncident({
        incidentId: incident.id,
        responderId,
        actorRole: role,
      });
      refresh();
    } catch (error) {
      // A losing race is expected, not exceptional: say who holds it now.
      setActionError(
        error?.message ?? "The incident could not be claimed. Refresh and retry.",
      );
      refresh();
    } finally {
      setClaimingId(null);
    }
  }

  const overdueCount = incidents.filter((incident) => incident.isOverdue).length;

  return (
    <Section
      id="incident-queue"
      title="Incident queue"
      description="Oldest first, so the longest wait is handled first. Nothing escalates on its own; this queue has to be watched."
      action={
        <button
          className="action-button action-button--secondary"
          onClick={refresh}
          type="button"
        >
          Refresh
        </button>
      }
    >
      <FormStatus message={actionError} />

      <div className="filter-row">
        <div className="form-field">
          <label className="form-field__label" htmlFor="status-filter">
            Status
          </label>
          <select
            className="form-field__input"
            id="status-filter"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="kind-filter">
            Kind
          </label>
          <select
            className="form-field__input"
            id="kind-filter"
            onChange={(event) => setKind(event.target.value)}
            value={kind}
          >
            {KIND_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {overdueCount > 0 && loadState === "ready" ? (
        <p className="stale-notice" role="status">
          {overdueCount} incident{overdueCount === 1 ? "" : "s"} passed the
          15 minute acknowledgement target and {overdueCount === 1 ? "is" : "are"}{" "}
          still unclaimed.
        </p>
      ) : null}

      {loadState === "loading" ? (
        <Skeleton label="Loading incidents" lines={5} />
      ) : null}

      {loadState === "error" ? (
        <ErrorState
          title="The queue could not be loaded"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={refresh}
        />
      ) : null}

      {loadState === "ready" && incidents.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          message="No incidents match the current filters."
        />
      ) : null}

      {loadState === "ready" && incidents.length > 0 ? (
        <ul className="report-list">
          {incidents.map((incident) => (
            <IncidentCard
              claiming={claimingId === incident.id}
              incident={incident}
              key={incident.id}
              onClaim={claim}
            />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
