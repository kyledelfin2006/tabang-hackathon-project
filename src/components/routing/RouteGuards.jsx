import { Navigate, useLocation } from "react-router-dom";
import { SESSION_STATUS } from "../../app/providers/AuthContext.js";
import { useAuth } from "../../app/providers/useAuth.js";
import ErrorState from "../feedback/ErrorState.jsx";
import LoadingState from "../feedback/LoadingState.jsx";
import { PageHeading } from "../ui/Primitives.jsx";
import { homeRouteForRole } from "../../services/auth/roles.js";

function SessionPending({ standalone = true }) {
  const state = (
    <LoadingState
      title="Checking your session"
      message="Confirming who you are before loading this page."
    />
  );

  return standalone ? (
    <div className="shell shell--public">
      <main className="shell__content">
        <PageHeading>Checking your session</PageHeading>
        {state}
      </main>
    </div>
  ) : (
    state
  );
}

function SessionUnavailable({ standalone = true }) {
  const state = (
    <ErrorState
      title="Try again later"
      message="We cannot confirm your account right now. If you need emergency help, call 911 or contact your barangay hall."
    />
  );

  return standalone ? (
    <div className="shell shell--public">
      <main className="shell__content">
        <PageHeading>Sign-in is unavailable</PageHeading>
        {state}
      </main>
    </div>
  ) : (
    state
  );
}

/**
 * Blocks a route until the session is known, so protected content never
 * flashes before a redirect.
 */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable />;
  }

  if (status === SESSION_STATUS.anonymous) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}

/**
 * Route guard for the responder area. Route guards are convenience only; the
 * Firestore rules remain the real authorization boundary.
 */
export function RequireResponder({ children }) {
  const { status, role, isResponder } = useAuth();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable />;
  }

  if (status === SESSION_STATUS.anonymous) {
    return <Navigate to="/login" replace />;
  }

  if (!isResponder) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }

  return children;
}

/**
 * Keeps signed-in users out of login and signup routes.
 */
export function RequireAnonymous({ children }) {
  const { status, role } = useAuth();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending standalone={false} />;
  }

  if (status === SESSION_STATUS.authenticated) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }

  return children;
}

/**
 * Route guard for reviewer-only screens.
 *
 * Reviewers see identity documents, so this is stricter than the responder
 * guard. The rules and the evidence endpoints enforce the same boundary
 * independently; this only avoids showing a route that would fail anyway.
 */
export function RequireReviewer({ children }) {
  const { status, role, isReviewer } = useAuth();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending standalone={false} />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable standalone={false} />;
  }

  if (status === SESSION_STATUS.anonymous) {
    return <Navigate to="/login" replace />;
  }

  if (!isReviewer) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }

  return children;
}
