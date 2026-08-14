const GENERIC_CREDENTIAL_MESSAGE =
  "That email and password combination did not work. Check both and try again.";
const GENERIC_FAILURE_MESSAGE =
  "Something went wrong. Check your connection and try again.";

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
    default:
      return GENERIC_FAILURE_MESSAGE;
  }
}

/**
 * Password reset must always report the same outcome, whether or not the
 * address exists, so the form cannot be used to enumerate accounts.
 */
export const PASSWORD_RESET_ACKNOWLEDGEMENT =
  "If that email address has an account, a password reset link is on its way. Check your inbox and spam folder.";

export { GENERIC_CREDENTIAL_MESSAGE, GENERIC_FAILURE_MESSAGE };
