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
 * Converts a Supabase auth error into a user-facing message.
 *
 * Every credential-related failure collapses into one message so the UI never
 * reveals whether an arbitrary email address is registered.
 */
export function describeAuthError(error) {
  // A network failure is a fetch that never got an answer; it has no code.
  if (error?.name === "AuthRetryableFetchError" || error?.name === "TypeError") {
    return "The network request failed. Check your connection and try again.";
  }

  const code = typeof error?.code === "string" ? error.code : "";

  switch (code) {
    case "invalid_credentials":
    case "email_address_invalid":
    case "user_not_found":
    case "user_banned":
      return GENERIC_CREDENTIAL_MESSAGE;
    case "email_not_confirmed":
      return "Confirm your email address using the link we sent, then sign in.";
    case "user_already_exists":
    case "email_exists":
      // Deliberately vague: registration must not confirm existing accounts.
      return "We could not complete that registration. If you already have an account, sign in or reset your password instead.";
    case "weak_password":
      return "Choose a longer, less predictable password.";
    case "same_password":
      return "Choose a password you have not used for this account before.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes before trying again.";

    /*
     * Setup faults. They mean the project is misconfigured (sign-ups or the
     * email provider are switched off, or the build has no configuration), and
     * no amount of retrying by the person will fix them.
     */
    case "signup_disabled":
    case "email_provider_disabled":
    case "app/auth-unavailable":
      return SETUP_FAILURE_MESSAGE;
    default:
      return GENERIC_FAILURE_MESSAGE;
  }
}

/**
 * The error code, for the console only.
 *
 * Users get plain language; whoever is debugging needs the code. This is safe
 * to log: Supabase auth codes carry no personal data, no email address, and no
 * token.
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