import { Link, useRouteError } from "react-router-dom";
import ErrorState from "../components/feedback/ErrorState.jsx";

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
        </ul>
      </section>
    </div>
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
          <h2>That page does not exist</h2>
          <p>
            That address does not match any page. If you followed an old link,
            the pages that moved are listed in the project documentation.
          </p>
          <div className="button-row">
            <Link className="action-button" to="/">
              Back to the home page
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
