/*
 * Redaction for anything that leaves the application as a log or report.
 *
 * A flood report contains the two things most likely to harm somebody if they
 * leak: where they are and how to reach them. An error monitor that captures
 * request payloads would collect both by default, so redaction happens before
 * anything is handed to a reporter rather than being configured inside one.
 */
const PHONE = /\b(?:\+63|0)9\d{9}\b/g;
const COORDINATE = /\b-?\d{1,3}\.\d{4,}\b/g;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]{2,}\b/g;
const TOKEN = /\b(?:ey[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g;
const IDENTITY_PATH = /tabang\/responder-applications\/[^\s"']+/g;

const SENSITIVE_KEYS = new Set([
  "contactPhone",
  "phone",
  "description",
  "preciseLocation",
  "latitude",
  "longitude",
  "identityDocumentPath",
  "selfiePath",
  "idToken",
  "email",
  "comment",
  "note",
  "reviewNotes",
]);

export function redactText(value) {
  return typeof value === "string"
    ? value
        .replace(TOKEN, "[token]")
        .replace(IDENTITY_PATH, "[identity-evidence]")
        .replace(EMAIL, "[email]")
        .replace(PHONE, "[phone]")
        .replace(COORDINATE, "[coordinate]")
    : value;
}

/**
 * Redacts a structured value.
 *
 * Known-sensitive keys are dropped by name rather than pattern-matched,
 * because a description is sensitive whether or not it happens to contain a
 * phone number. Remaining strings are still swept for patterns, since a field
 * name is not a reliable guide to what somebody typed into it.
 */
export function redactValue(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEYS.has(key) ? "[redacted]" : redactValue(entry, depth + 1),
      ]),
    );
  }

  return value;
}

/**
 * Builds a report safe to send to an error monitor.
 *
 * No monitor is wired up. This exists so that when one is added, redaction is
 * already the default path rather than an option somebody has to remember.
 */
export function buildSafeErrorReport(error, context = {}) {
  return {
    message: redactText(error?.message ?? String(error)),
    name: error?.name ?? "Error",
    context: redactValue(context),
  };
}
