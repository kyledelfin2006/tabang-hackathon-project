import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import Modal from "../../components/feedback/Modal.jsx";
import {
  ActionLink,
  Badge,
  Card,
  Section,
  Skeleton,
} from "../../components/ui/Primitives.jsx";
import { createAdvisoryRepository } from "../../services/advisories/advisoryRepository.js";

const QUICK_ACTIONS = [
  {
    to: "/app/reports/new",
    label: "Report flood",
    description: "Send a flood report with your location.",
  },
  {
    to: "/app/help/new",
    label: "Request help",
    description: "Ask responders for assistance.",
  },
  {
    to: "/app/hotlines",
    label: "Hotlines",
    description: "Reach emergency lines in Aklan.",
  },
];

const RESOURCES = [
  {
    id: "safety",
    title: "Safety tips",
    teaser: "How to stay safe during floods.",
    detail:
      "Stay indoors and move to higher ground early. Never walk or drive through floodwater; six inches of moving water can knock you off your feet. Keep your phone charged and your emergency contacts written down somewhere that does not need power.",
  },
  {
    id: "evacuation",
    title: "Evacuation centers",
    teaser: "Find the shelter nearest you.",
    detail:
      "Your barangay hall assigns evacuation centers, usually the covered court or school gymnasium. Contact your barangay hall or the municipal DRRM office for the center currently open in your area, and confirm before travelling.",
  },
  {
    id: "first-aid",
    title: "First aid basics",
    teaser: "Steps to take before help arrives.",
    detail:
      "Keep wounds clean and dry, and cover them to prevent infection from floodwater. Keep an injured person warm and still. For serious injuries, difficulty breathing, or unconsciousness, contact emergency services immediately rather than treating it yourself.",
  },
];

const STALE_AFTER_MS = 5 * 60 * 1000;

function formatWhen(millis) {
  if (!millis) {
    return "Time not recorded";
  }

  return new Date(millis).toLocaleString();
}

function AdvisoryList({ advisories }) {
  if (advisories.length === 0) {
    return (
      <EmptyState
        title="No advisories right now"
        message="Verified advisories published by responders will appear here. Your own reports stay private and are never shown in this list."
      />
    );
  }

  return (
    <ul className="advisory-list">
      {advisories.map((advisory) => (
        <li className="advisory-item" key={advisory.id}>
          <div className="advisory-item__meta">
            <Badge tone={advisory.kind === "flood" ? "warning" : "info"}>
              {advisory.kind}
            </Badge>
            {advisory.barangay ? <span>{advisory.barangay}</span> : null}
          </div>
          <p className="advisory-item__summary">{advisory.summary}</p>
          <p className="advisory-item__time">
            {formatWhen(advisory.createdAtMillis)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function ResidentHomePage({ advisoryRepository }) {
  const repository = useMemo(
    () => advisoryRepository ?? createAdvisoryRepository(),
    [advisoryRepository],
  );

  const [advisories, setAdvisories] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [loadedAt, setLoadedAt] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [openResource, setOpenResource] = useState(null);
  const activeRequestRef = useRef(0);

  /**
   * Only writes state after the await, so the mount effect below never sets
   * state synchronously.
   */
  const runFetch = useCallback(
    async (requestId) => {
      try {
        const results = await repository.listRecentAdvisories();

        if (activeRequestRef.current !== requestId) {
          return;
        }

        setAdvisories(results);
        setLoadedAt(Date.now());
        setIsStale(false);
        setLoadState("ready");
      } catch {
        if (activeRequestRef.current !== requestId) {
          return;
        }

        setLoadState("error");
      }
    },
    [repository],
  );

  const refresh = useCallback(() => {
    activeRequestRef.current += 1;
    setLoadState("loading");
    runFetch(activeRequestRef.current);
  }, [runFetch]);

  useEffect(() => {
    activeRequestRef.current += 1;
    runFetch(activeRequestRef.current);

    return () => {
      // Ignore any in-flight response once this route unmounts.
      activeRequestRef.current += 1;
    };
  }, [runFetch]);

  useEffect(() => {
    if (!loadedAt) {
      return undefined;
    }

    const timer = setTimeout(() => setIsStale(true), STALE_AFTER_MS);

    return () => clearTimeout(timer);
  }, [loadedAt]);

  const activeResource = RESOURCES.find(
    (resource) => resource.id === openResource,
  );

  return (
    <>
      <section className="page-hero">
        <div>
          <span className="section-tag">Resident home</span>
          <h2>What do you need right now?</h2>
          <p>
            Reports you submit stay private to you and the responders handling
            them.
          </p>
        </div>
      </section>

      <Section
        id="quick-actions"
        title="Quick actions"
        description="Every action here is a real route, so links, bookmarks, and the back button all work."
      >
        <div className="card-grid">
          {QUICK_ACTIONS.map((action) => (
            <Card key={action.to}>
              <h4>{action.label}</h4>
              <p>{action.description}</p>
              <div className="button-row">
                <ActionLink to={action.to}>{action.label}</ActionLink>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="advisories"
        title="Latest advisories"
        description="Published, sanitized advisories only — at most six, and never private report photos or exact locations."
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
        {isStale && loadState === "ready" ? (
          <p className="stale-notice" role="status">
            This list was loaded a while ago and may be out of date. Refresh to
            check for newer advisories.
          </p>
        ) : null}

        {loadState === "loading" ? (
          <Skeleton label="Loading advisories" lines={3} />
        ) : null}

        {loadState === "error" ? (
          <ErrorState
            title="Advisories could not be loaded"
            message="The advisory list is unavailable. This does not affect your ability to submit a report."
            actionLabel="Try again"
            onAction={refresh}
          />
        ) : null}

        {loadState === "ready" ? (
          <AdvisoryList advisories={advisories} />
        ) : null}
      </Section>

      <Section
        id="resources"
        title="Emergency resources"
        description="General preparedness guidance. For a live emergency, contact official emergency services."
      >
        <div className="card-grid">
          {RESOURCES.map((resource) => (
            <Card key={resource.id}>
              <h4>{resource.title}</h4>
              <p>{resource.teaser}</p>
              <div className="button-row">
                <button
                  className="action-button action-button--secondary"
                  onClick={() => setOpenResource(resource.id)}
                  type="button"
                >
                  Read {resource.title.toLowerCase()}
                </button>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="more" title="More">
        <ul className="link-list">
          <li>
            <Link to="/app/reports">See the reports you have submitted</Link>
          </li>
          <li>
            <Link to="/app/community">Browse community advisories</Link>
          </li>
          <li>
            <Link to="/app/responder-application">Apply to be a responder</Link>
          </li>
        </ul>
      </Section>

      <Modal
        open={Boolean(activeResource)}
        title={activeResource?.title ?? ""}
        description={activeResource?.detail ?? ""}
        onClose={() => setOpenResource(null)}
      />
    </>
  );
}
