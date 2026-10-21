import { redactValue } from "../src/services/observability/redact.js";

/**
 * One JSON line per API request.
 *
 * Only request metadata is logged, never bodies or headers, and the line
 * still passes through the same redaction the app uses, so a phone number or
 * email typed into a path cannot reach the log.
 */
export function requestLine(fields) {
  return JSON.stringify(redactValue(fields));
}

export function logToStdout(line) {
  process.stdout.write(`${line}\n`);
}
