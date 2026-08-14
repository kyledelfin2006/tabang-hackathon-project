import { createContext } from "react";
import { ROLES } from "../../services/auth/roles.js";

export const SESSION_STATUS = Object.freeze({
  loading: "loading",
  anonymous: "anonymous",
  authenticated: "authenticated",
  unavailable: "unavailable",
});

export const defaultAuthValue = Object.freeze({
  status: SESSION_STATUS.loading,
  user: null,
  profile: null,
  role: ROLES.resident,
  isResponder: false,
  isReviewer: false,
  initializationError: null,
  signIn: async () => {},
  register: async () => {},
  sendPasswordReset: async () => {},
  signOut: async () => {},
  updateOwnProfile: async () => {},
});

export const AuthContext = createContext(defaultAuthValue);
