import { getApiClient } from "../http/apiClient.js";
import { normalizeProfileRecord } from "./profile.js";
import { ROLES, normalizeRole } from "./roles.js";

// Where the emailed reset link lands; the page there sets the new password.
export const PASSWORD_UPDATE_PATH = "/update-password";

function toSessionUser(rawUser, profile) {
  if (!rawUser) return null;
  return Object.freeze({
    uid: rawUser.uid || rawUser.id,
    email: rawUser.email ?? "",
    displayName: profile?.displayName || rawUser.displayName || "",
    emailVerified: rawUser.emailVerified ?? true,
  });
}

function parseSessionPayload(data) {
  if (!data || !data.user) {
    return null;
  }

  const role = normalizeRole(data.role ?? ROLES.resident);
  const profile = data.profile
    ? normalizeProfileRecord({
        displayName: data.profile.displayName || data.profile.display_name || "",
        email: data.profile.email || data.user.email || "",
        phone: data.profile.phone || "",
        barangay: data.profile.barangay || "",
      })
    : null;

  return Object.freeze({
    user: toSessionUser(data.user, profile),
    role,
    profile,
  });
}

export function createAuthGateway({ client } = {}) {
  const api = () => client ?? getApiClient();
  const listeners = new Set();
  const pendingListeners = new Set();
  let currentSession = null;
  let hasLoaded = false;
  let sessionSeq = 0;

  function notifyPending() {
    for (const pending of pendingListeners) {
      try {
        pending();
      } catch {
        // Ignore pending listener errors
      }
    }
  }

  async function refreshSession() {
    const seq = ++sessionSeq;
    notifyPending();
    let session = null;
    try {
      const data = await api().get("/api/app/session");
      session = parseSessionPayload(data);
    } catch {
      // Failed to load session; remains null
    }

    if (seq !== sessionSeq) {
      // A later event (e.g. signOut) superceded this fetch; drop the stale build
      return currentSession;
    }

    hasLoaded = true;
    currentSession = session;
    for (const listener of listeners) {
      try {
        listener(currentSession);
      } catch {
        // Ignore listener exceptions
      }
    }
    return currentSession;
  }

  return {
    /**
     * Calls `listener` with each built session, or null when signed out.
     */
    observeSession(listener, { onPending } = {}) {
      listeners.add(listener);
      if (onPending) {
        pendingListeners.add(onPending);
      }

      if (!hasLoaded) {
        onPending?.();
        refreshSession();
      } else {
        setTimeout(() => {
          if (listeners.has(listener)) {
            listener(currentSession);
          }
        }, 0);
      }

      return () => {
        listeners.delete(listener);
        if (onPending) {
          pendingListeners.delete(onPending);
        }
      };
    },

    async signIn({ email, password }) {
      notifyPending();
      await api().post("/api/app/sign-in", { email, password });
      await refreshSession();
    },

    async register({ email, password, displayName, phone, barangay }) {
      notifyPending();
      await api().post("/api/app/sign-up", {
        email,
        password,
        confirmPassword: password,
        displayName,
        phone,
        barangay,
      });
      await refreshSession();
    },

    async updateOwnProfile(uid, { displayName, phone, barangay }) {
      await api().patch("/api/app/profile", {
        displayName,
        phone,
        barangay,
      });
      await refreshSession();
    },

    async sendPasswordReset(email) {
      await api().post("/api/app/password-reset", { email });
    },

    async updatePassword(password, { token } = {}) {
      if (token) {
        await api().post("/api/app/password-reset/confirm", { token, password });
      } else {
        let urlToken = null;
        if (typeof window !== "undefined" && window.location?.search) {
          const params = new URLSearchParams(window.location.search);
          urlToken = params.get("token");
        }

        if (urlToken) {
          await api().post("/api/app/password-reset/confirm", { token: urlToken, password });
        } else {
          await api().post("/api/app/password", { password });
        }
      }
    },

    async signOut() {
      sessionSeq++;
      currentSession = null;
      hasLoaded = true;
      try {
        await api().post("/api/app/sign-out");
      } finally {
        for (const listener of listeners) {
          try {
            listener(null);
          } catch {
            // Ignore listener exceptions
          }
        }
      }
    },
  };
}
