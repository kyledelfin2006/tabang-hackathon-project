const GENERIC_CREDENTIAL_MESSAGE =
  "That email and password combination did not work. Check both and try again.";

/*
 * The fallback must not blame the network.
 *
 * It used to read "Check your connection and try again", which is a confident
 * claim about a cause we have not established — every unrecognised code landed
 * on it, including server misconfiguration. Someone whose connection is fine
 * goes and tests their connection, and the real fault stays hidden. A real
 * network failure has its own code and its own message below.
 */
const GENERIC_FAILURE_MESSAGE =
  "That did not work, and the reason is not something this page can explain. Try again in a moment. If it keeps happening, the problem is on our side, not yours.";

const SETUP_FAILURE_MESSAGE =
  "Sign-in is not configured correctly on this site. This is a fault on our side and retrying will not help. Please report it.";

/**
 * Converts a Firebase auth error into a user-facing message.
 *
 * Every credential-related failure collapses into one message so the UI never
 * reveals whether an arbitrary email address is registered.
 */
export function describeAuthError(error) {
  const code = typeof error?.code === "string" ? error.code : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/invalid-login-credentials":
    case "auth/user-disabled":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return GENERIC_CREDENTIAL_MESSAGE;
    case "auth/email-already-in-use":
      // Deliberately vague: registration must not confirm existing accounts.
      return "We could not complete that registration. If you already have an account, sign in or reset your password instead.";
    case "auth/weak-password":
      return "Choose a longer, less predictable password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes before trying again.";
    case "auth/network-request-failed":
      return "The network request failed. Check your connection and try again.";

    /*
     * Setup faults. These are the codes that were being reported as connection
     * problems. They mean the project is misconfigured — the sign-in provider
     * is switched off, the domain is not authorised, or Authentication was
     * never enabled — and no amount of retrying by the person will fix them.
     */
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
    case "auth/unauthorized-domain":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return SETUP_FAILURE_MESSAGE;

    // A Firestore rejection during registration, after the account itself was
    // created. Worth its own message: the account may well exist.
    case "permission-denied":
      return "Your account was created, but your profile could not be saved. Try signing in.";
    default:
      return GENERIC_FAILURE_MESSAGE;
  }
}

/**
 * The error code, for the console only.
 *
 * Users get plain language; whoever is debugging needs the code. This is safe
 * to log — Firebase auth codes carry no personal data, no email address, and
 * no token.
 */
export function describeAuthErrorForDiagnostics(error) {
  const code = typeof error?.code === "string" ? error.code : "(no code)";

  return `Tabang auth failure: ${code}`;
}

/**
 * Password reset must always report the same outcome, whether or not the
 * address exists, so the form cannot be used to enumerate accounts.
 */
export const PASSWORD_RESET_ACKNOWLEDGEMENT =
  "If that email address has an account, a password reset link is on its way. Check your inbox and spam folder.";

export {
  GENERIC_CREDENTIAL_MESSAGE,
  GENERIC_FAILURE_MESSAGE,
  SETUP_FAILURE_MESSAGE,
};
