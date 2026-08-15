import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { ActionLink, Card, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import {
  INCIDENT_PAGE_SIZE,
  createIncidentRepository,
} from "../../services/incidents/incidentRepository.js";
import {
  METRIC_DEFINITIONS,
  computeMetrics,
  describeCoverage,
  isMetricSetStale,
} from "../../services/metrics/dashboardMetrics.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Never";
}

export default function ResponderDashboardPage({ incidentRepository }) {
  const repository = useMemo(
    () => incidentRepository ?? createIncidentRepository(),
    [incidentRepository],
  );

  const [metrics, setMetrics] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const incidents = await repository.listIncidents({ status: "open" });

        if (activeRef.current !== requestId) {
          return;
        }

        setMetrics(computeMetrics(incidents, { pageLimit: INCIDENT_PAGE_SIZE }));
        setLoadState("ready");
      } catch {
        if (activeRef.current === requestId) {
          // No cached or sample numbers are shown instead. A dashboard that
          // invents figures when the data source fails is worse than one that
          // admits it has nothing.
          setLoadState("error");
        }
      }
    },
    [repository],
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

  const stale =
    metrics !== null && isMetricSetStale(metrics.generatedAtMillis);

  return (
    <>
      <Section
        id="metrics"
        title="Operational summary"
        description="Every figure here is counted from records this deployment holds. Nothing is estimated, projected, or sampled."
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
        {loadState === "loading" ? (
          <Skeleton label="Loading the summary" lines={4} />
        ) : null}

        {loadState === "error" ? (
          <ErrorState
            title="The summary is unavailable"
            message="No figures are shown rather than showing out-of-date or estimated ones. The incident queue may still work."
            actionLabel="Try again"
            onAction={refresh}
          />
        ) : null}

        {loadState === "ready" && metrics ? (
          <>
            {stale ? (
              <p className="stale-notice" role="status">
                These figures were counted at {formatWhen(metrics.generatedAtMillis)}{" "}
                and may be out of date. Refresh before acting on them.
              </p>
            ) : null}

            <div className="card-grid">
              {METRIC_DEFINITIONS.map((definition) => (
                <Card key={definition.key}>
                  <p className="metric-value">
                    {metrics.values[definition.key]}
                  </p>
                  <h4>{definition.label}</h4>
                  <p>{definition.description}</p>
                  <p className="metric-source">{definition.source}</p>
                </Card>
              ))}
            </div>

            <div className="detail-list">
              <span>
                <strong>Counted at</strong>
                {formatWhen(metrics.generatedAtMillis)}
              </span>
              <span>
                <strong>Coverage</strong>
                {describeCoverage({
                  truncated: metrics.truncated,
                  pageLimit: INCIDENT_PAGE_SIZE,
                })}
              </span>
            </div>
          </>
        ) : null}
      </Section>

      <Section
        id="not-shown"
        title="What this dashboard does not show"
        description="The previous version displayed population and evacuation totals that had no source. They are not shown here because nothing in this system can count them."
      >
        <EmptyState
          title="No population or evacuation figures"
          message="Numbers like people affected or families evacuated would have to come from a municipal or DRRM data source this deployment is not connected to. Ask the MDRRMO for those directly."
        />

        <div className="button-row">
          <ActionLink to="/responder/incidents">Open the incident queue</ActionLink>
        </div>
      </Section>
    </>
  );
}
