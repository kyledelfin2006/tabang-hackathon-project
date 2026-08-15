import { Navigate, useLocation } from "react-router-dom";
import { SESSION_STATUS } from "../../app/providers/AuthContext.js";
import { useAuth } from "../../app/providers/useAuth.js";
import ErrorState from "../feedback/ErrorState.jsx";
import LoadingState from "../feedback/LoadingState.jsx";
import { homeRouteForRole } from "../../services/auth/roles.js";

function SessionPending() {
  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <LoadingState
          title="Checking your session"
          message="Confirming who you are before loading this page."
        />
      </main>
    </div>
  );
}

function SessionUnavailable({ detail }) {
  return (
    <div className="shell shell--public">
      <main className="shell__content">
        <ErrorState
          title="Sign-in is unavailable"
          message={
            detail ??
            "The application could not reach the authentication service."
          }
        />
      </main>
    </div>
  );
}

/**
 * Blocks a route until the session is known, so protected content never
 * flashes before a redirect.
 */
export function RequireAuth({ children }) {
  const { status, initializationError } = useAuth();
  const location = useLocation();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable detail={initializationError} />;
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
  const { status, role, isResponder, initializationError } = useAuth();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable detail={initializationError} />;
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
    return <SessionPending />;
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
  const { status, role, isReviewer, initializationError } = useAuth();

  if (status === SESSION_STATUS.loading) {
    return <SessionPending />;
  }

  if (status === SESSION_STATUS.unavailable) {
    return <SessionUnavailable detail={initializationError} />;
  }

  if (status === SESSION_STATUS.anonymous) {
    return <Navigate to="/login" replace />;
  }

  if (!isReviewer) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }

  return children;
}
