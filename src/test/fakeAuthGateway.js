import { ROLES } from "../services/auth/roles.js";

/**
 * An in-memory stand-in for the Firebase auth gateway.
 *
 * Unit tests must never reach a real Firebase project, and the provider takes
 * its gateway by injection precisely so this can be substituted.
 */
export function createFakeAuthGateway({ session = null, actions = {} } = {}) {
  const listeners = new Set();
  let currentSession = session;

  const gateway = {
    observeSession(listener) {
      listeners.add(listener);
      // Mirrors Firebase: the current value arrives asynchronously.
      queueMicrotask(() => listener(currentSession));

      return () => listeners.delete(listener);
    },
    emit(nextSession) {
      currentSession = nextSession;
      listeners.forEach((listener) => listener(nextSession));
    },
    signIn: actions.signIn ?? (async () => {}),
    register: actions.register ?? (async () => {}),
    sendPasswordReset: actions.sendPasswordReset ?? (async () => {}),
    signOut: actions.signOut ?? (async () => {}),
    updateOwnProfile: actions.updateOwnProfile ?? (async () => {}),
  };

  return gateway;
}

export function residentSession(overrides = {}) {
  return {
    user: {
      uid: "resident-1",
      email: "resident@example.test",
      displayName: "Resident One",
      emailVerified: true,
    },
    role: ROLES.resident,
    profile: {
      displayName: "Resident One",
      email: "resident@example.test",
      phone: "09171234567",
      barangay: "Poblacion",
    },
    ...overrides,
  };
}

export function responderSession(overrides = {}) {
  return residentSession({ role: ROLES.responder, ...overrides });
}
