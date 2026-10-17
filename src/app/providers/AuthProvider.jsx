import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ROLES,
  isResponderRole,
  isReviewerRole,
} from "../../services/auth/roles.js";
import { createSubmissionQueue } from "../../services/offline/submissionQueue.js";
import { AuthContext, SESSION_STATUS } from "./AuthContext.js";

const ANONYMOUS_SESSION = Object.freeze({
  user: null,
  profile: null,
  role: ROLES.resident,
});

/**
 * The single source of session truth for the application.
 *
 * Components never call Supabase directly; they read this context and call the
 * gateway actions it exposes. Tests inject a fake gateway instead of Supabase.
 */
export default function AuthProvider({ children, gateway }) {
  const [session, setSession] = useState(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [loadedGateway, setLoadedGateway] = useState(null);

  /*
   * The Supabase SDK is imported dynamically.
   *
   * A static import puts the whole SDK in the entry chunk, so every visitor
   * would download it before the landing page could paint, including
   * anyone who only wanted a hotline number. Splitting the routes alone did
   * not help, because this provider is mounted for every route.
   *
   * Tests inject a gateway and never reach this path.
   */
  useEffect(() => {
    if (gateway) {
      return undefined;
    }

    let cancelled = false;

    import("../../services/auth/supabaseAuthGateway.js")
      .then((module) => {
        if (cancelled) {
          return;
        }

        setLoadedGateway({ gateway: module.createAuthGateway(), error: null });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        // Missing configuration must fail loudly rather than silently
        // rendering protected content. The message names the missing
        // VITE_SUPABASE_* keys, so it goes to the console verbatim: without it
        // the only visible symptom is every sign-in failing for no stated
        // reason.
        console.error("Tabang: Supabase failed to initialise.", error);

        setLoadedGateway({
          gateway: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [gateway]);

  // Memoised so the observer effect below does not resubscribe on every
  // render. Computed during render, so no state is set inside an effect.
  const setup = useMemo(
    () => (gateway ? { gateway, error: null } : loadedGateway),
    [gateway, loadedGateway],
  );

  useEffect(() => {
    if (!setup?.gateway) {
      return undefined;
    }

    return setup.gateway.observeSession(
      (nextSession) => {
        setSession(nextSession ?? null);
        setSessionResolved(true);
      },
      // A different user is signing in: stay loading until their session is
      // built, so guards do not bounce them back to the sign-in form.
      { onPending: () => setSessionResolved(false) },
    );
  }, [setup]);

  const requireGateway = useCallback(() => {
    if (!setup?.gateway) {
      /*
       * Carries a code so the error mapper can name this properly.
       *
       * Without one it fell through to the generic message, which told the
       * person to try again in a moment, advice that can never work, because
       * the app has no Supabase configuration and every retry fails
       * identically. The cause is almost always a build made without the
       * VITE_SUPABASE_* values present.
       */
      const error = new Error(
        "Authentication is unavailable: the app has no Supabase configuration.",
      );

      error.code = "app/auth-unavailable";
      throw error;
    }

    return setup.gateway;
  }, [setup]);

  const signIn = useCallback(
    (input) => requireGateway().signIn(input),
    [requireGateway],
  );
  const register = useCallback(
    (input) => requireGateway().register(input),
    [requireGateway],
  );
  const sendPasswordReset = useCallback(
    (email) => requireGateway().sendPasswordReset(email),
    [requireGateway],
  );
  const signOutOfSession = useCallback(async () => {
    await requireGateway().signOut();
    // A queued report holds precise coordinates and a contact number. Phones
    // get shared and handed around during an evacuation, so signing out must
    // not leave one behind.
    createSubmissionQueue().clear();
  }, [requireGateway]);
  const updateOwnProfile = useCallback(
    (uid, input) => requireGateway().updateOwnProfile(uid, input),
    [requireGateway],
  );
  const updatePassword = useCallback(
    (password) => requireGateway().updatePassword(password),
    [requireGateway],
  );

  const value = useMemo(() => {
    let status = SESSION_STATUS.loading;

    if (setup?.error) {
      status = SESSION_STATUS.unavailable;
    } else if (sessionResolved) {
      status = session ? SESSION_STATUS.authenticated : SESSION_STATUS.anonymous;
    }

    const resolved = session ?? ANONYMOUS_SESSION;
    const role = resolved.role ?? ROLES.resident;
    const authenticated = status === SESSION_STATUS.authenticated;

    return {
      status,
      user: authenticated ? resolved.user : null,
      profile: authenticated ? (resolved.profile ?? null) : null,
      role: authenticated ? role : ROLES.resident,
      isResponder: authenticated && isResponderRole(role),
      isReviewer: authenticated && isReviewerRole(role),
      // Optional: `setup` is null on the first render in production, before
      // the dynamic Supabase import resolves. Tests inject a gateway, so
      // `setup` is always truthy there and never exercised this path.
      initializationError: setup?.error ?? null,
      signIn,
      register,
      sendPasswordReset,
      signOut: signOutOfSession,
      updateOwnProfile,
      updatePassword,
    };
  }, [
    setup,
    session,
    sessionResolved,
    signIn,
    register,
    sendPasswordReset,
    signOutOfSession,
    updateOwnProfile,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
