/**
 * Plain-language copy for a failed action.
 *
 * Takes the errors the repositories throw (a `code` from a database function
 * or the provider) and never returns the provider's own message, which can name
 * tables, columns, or policies.
 */
const COPY = Object.freeze({
  network: "The connection failed. Check your signal and try again.",
  forbidden: "You do not have permission to do that. Sign in again and retry.",
  not_found: "That item no longer exists. Refresh and try again.",
  already_claimed: "Another responder has already claimed this incident.",
  invalid_transition:
    "That change is no longer possible. Refresh to see the latest status.",
  not_cancellable:
    "This report can no longer be cancelled because responders are already acting on it.",
  invalid_request: "Some details were not accepted. Check them and try again.",
  storage:
    "A photo was too large or was not an image. Remove it and try again.",
  unknown: "That did not work. Try again in a moment.",
});

const PERMISSION_CODES = new Set(["forbidden", "42501", "401", "403"]);
const REJECTED_INPUT_CODES = new Set([
  "invalid_request",
  "23514",
  "23502",
  "22P02",
]);

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Sorts a failure into one of the reasons the screens act on. */
export function classifyActionError(error) {
  const cause = error?.cause ?? error;
  const text = `${cause?.name ?? ""} ${cause?.message ?? ""}`;

  if (isOffline() || /TypeError|fetch|network/i.test(text)) {
    return "network";
  }

  if (PERMISSION_CODES.has(String(error?.code ?? ""))) {
    return "permission";
  }

  return "unknown";
}

export function describeActionError(error) {
  const code = String(error?.code ?? "");
  const status = String(error?.cause?.statusCode ?? error?.statusCode ?? "");

  if (classifyActionError(error) === "network") {
    return COPY.network;
  }

  if (Object.hasOwn(COPY, code)) {
    return COPY[code];
  }

  if (PERMISSION_CODES.has(code)) {
    return COPY.forbidden;
  }

  if (REJECTED_INPUT_CODES.has(code)) {
    return COPY.invalid_request;
  }

  if (status === "413" || status === "415") {
    return COPY.storage;
  }

  return COPY.unknown;
}
