import { useMemo, useState } from "react";
import { Link, useRouteError } from "react-router-dom";
import EmptyState from "../components/feedback/EmptyState.jsx";
import ErrorState from "../components/feedback/ErrorState.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import Modal from "../components/feedback/Modal.jsx";
import { useToast } from "../components/feedback/useToast.js";

function RouteShellPage({
  area,
  title,
  summary,
  statusLabel,
  routePath,
  legacyHref,
  checklist,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const { pushToast } = useToast();
  const routeChecklist = useMemo(() => checklist ?? [], [checklist]);

  return (
    <>
      <section className="page-hero">
        <div>
          <span className="section-tag">{area}</span>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        <div className="hero-pill">{statusLabel}</div>
      </section>

      <section className="card-grid">
        <article className="surface-card">
          <h3>Route placeholder</h3>
          <p>This route is now owned by the new React shell while the working legacy page remains reachable.</p>
          <div className="detail-list">
            <span>
              <strong>New route</strong>
              {routePath}
            </span>
            <span>
              <strong>Legacy page</strong>
              <a href={legacyHref}>{legacyHref}</a>
            </span>
          </div>
          <div className="button-row">
            <button className="action-button" onClick={() => pushToast(`${title} toast preview`)} type="button">
              Show toast
            </button>
            <button
              className="action-button action-button--secondary"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              Open modal
            </button>
          </div>
        </article>

        <LoadingState
          title="Reusable loading pattern"
          message="The migration now has one loading component instead of repeating bespoke spinners per page."
        />
        <EmptyState
          title="Reusable empty pattern"
          message="Future data-backed routes can reuse this placeholder when no reports, hotlines, or incidents are available."
        />
        <ErrorState
          title="Reusable error pattern"
          message="Each route now has a shared recoverable error treatment instead of page-specific ad hoc alerts."
          actionLabel="Acknowledge"
          onAction={() => pushToast(`${title} error state acknowledged`)}
        />
      </section>

      <section className="surface-card">
        <h3>Phase 1 completion notes</h3>
        <ul className="checklist">
          {routeChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <Modal
        open={modalOpen}
        title={`${title} modal preview`}
        description="This shared modal proves the shell has a common dialog treatment before feature migrations begin."
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

export function LandingRoute() {
  return (
    <div className="landing-grid">
      <section className="landing-panel">
        <span className="section-tag">Tabang</span>
        <h2>Report flooding and request help in Aklan</h2>
        <p>
          Sign in to report flooding, request assistance, and see the hotlines
          serving your barangay. Responder access is reviewed separately.
        </p>
        <div className="button-row">
          <Link className="action-button" to="/login">
            Sign in
          </Link>
          <Link className="action-button action-button--secondary" to="/signup">
            Create an account
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <h3>More</h3>
        <ul className="link-list">
          <li>
            <Link to="/reset-password">Reset your password</Link>
          </li>
          <li>
            <Link to="/privacy">Privacy policy and terms</Link>
          </li>
          <li>
            <a href="/legacy-index.html">Legacy landing prototype</a>
          </li>
          <li>
            <a href="/Homepage.html">Legacy resident home</a>
          </li>
        </ul>
      </section>
    </div>
  );
}

export function HotlinesRoute() {
  return (
    <RouteShellPage
      area="Resident route"
      title="Hotlines"
      summary="Resident hotline access now has a stable route in the new shell."
      statusLabel="Resident layout"
      routePath="/app/hotlines"
      legacyHref="/Hotline.html"
      checklist={[
        "Hotline route will eventually be shared by resident and responder flows.",
        "Legacy hotline page remains reachable during migration.",
      ]}
    />
  );
}

export function ResponderApplicationRoute() {
  return (
    <RouteShellPage
      area="Resident route"
      title="Responder Application"
      summary="This route replaces the idea of public self-verification with a future authenticated application flow."
      statusLabel="Resident layout"
      routePath="/app/responder-application"
      legacyHref="/VerAcc.html"
      checklist={[
        "A dedicated application route now exists in the new shell.",
        "The broken public verification page remains available only as a legacy reference.",
      ]}
    />
  );
}

export function ResponderDashboardRoute() {
  return (
    <RouteShellPage
      area="Responder route"
      title="Responder Dashboard"
      summary="Responder routes now share one operational layout instead of separate HTML entry screens."
      statusLabel="Responder layout"
      routePath="/responder"
      legacyHref="/responderhomepage.html"
      checklist={[
        "Responder layout renders shared bottom navigation.",
        "A dedicated responder route tree now exists in the shell.",
      ]}
    />
  );
}

export function IncidentsRoute() {
  return (
    <RouteShellPage
      area="Responder route"
      title="Incident Queue"
      summary="This placeholder reserves the route that will later host the indexed incident queue."
      statusLabel="Responder layout"
      routePath="/responder/incidents"
      legacyHref="/AllReports.html"
      checklist={[
        "Responder queue route is established.",
        "Future incident tools can migrate here incrementally.",
      ]}
    />
  );
}

export function IncidentDetailRoute() {
  return (
    <RouteShellPage
      area="Responder route"
      title="Incident Detail"
      summary="A protected detail route now exists for future responder workflows and audits."
      statusLabel="Responder layout"
      routePath="/responder/incidents/:id"
      legacyHref="/AllReports.html"
      checklist={[
        "Parameterized responder route works inside the shell.",
        "This route will host event history in later phases.",
      ]}
    />
  );
}

export function ResponderHotlinesRoute() {
  return (
    <RouteShellPage
      area="Responder route"
      title="Responder Hotlines"
      summary="Responder hotline analytics now have a stable destination in the new route tree."
      statusLabel="Responder layout"
      routePath="/responder/hotlines"
      legacyHref="/responderhotline.html"
      checklist={[
        "Responder hotline route now lives in the shared shell.",
        "Later hotline consolidation can reuse the same route model.",
      ]}
    />
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const detail = error instanceof Error ? error.message : "The route failed before it could render.";

  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <ErrorState
          title="Route error boundary"
          message={detail}
          actionLabel="Return home"
          onAction={() => {
            window.location.assign("/");
          }}
        />
      </main>
    </div>
  );
}

export function NotFoundRoute() {
  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <section className="surface-card surface-card--wide">
          <span className="section-tag">Not found</span>
          <h2>That route is outside the current migration scope.</h2>
          <p>
            The Phase 1 shell now has a proper not-found page. Clean routes should be rewritten to the
            app shell in Vite or production hosting, while missing file assets should return a real 404.
          </p>
          <div className="button-row">
            <Link className="action-button" to="/">
              Back to shell home
            </Link>
            <a className="action-button action-button--secondary" href="/legacy-index.html">
              Open legacy landing
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
