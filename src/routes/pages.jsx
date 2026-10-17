import { Link } from "react-router-dom";
import EmergencyCallCard from "../components/feedback/EmergencyCallCard.jsx";
import ErrorState from "../components/feedback/ErrorState.jsx";
import { PageHeading } from "../components/ui/Primitives.jsx";
import usePageTitle from "../components/navigation/usePageTitle.js";

export function LandingRoute() {
  return (
    <>
      <EmergencyCallCard />
      <div className="landing-grid">
        <section className="landing-panel">
          <p>
            Sign in to report flooding, request assistance, and see the hotlines
            serving your barangay. Responder access is reviewed separately.
          </p>
          <div className="button-row">
            <Link className="action-button" to="/login">
              Sign in
            </Link>
            <Link
              className="action-button action-button--secondary"
              to="/signup"
            >
              Create an account
            </Link>
          </div>
        </section>

        <section className="surface-card">
          <h2>More</h2>
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
    </>
  );
}

export function RouteErrorPage() {
  usePageTitle("Page error");

  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <PageHeading>This page could not load</PageHeading>
        <ErrorState
          title="Please try again"
          message="Something went wrong while opening this page. Return home and try again."
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
  usePageTitle("Page not found");

  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <section className="surface-card surface-card--wide">
          <span className="section-tag">Not found</span>
          <PageHeading>That page does not exist</PageHeading>
          <p>Try the home page or open the emergency hotline directory.</p>
          <div className="button-row">
            <Link className="action-button" to="/">
              Back to the home page
            </Link>
            <Link
              className="action-button action-button--secondary"
              to="/hotlines"
            >
              Emergency hotlines
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
