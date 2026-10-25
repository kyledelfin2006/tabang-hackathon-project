// The stable messages the database functions raise; see
// supabase/migrations/*_functions.sql.
const FUNCTION_CODES = new Set([
  "not_found",
  "forbidden",
  "already_claimed",
  "invalid_transition",
  "not_cancellable",
  "invalid_request",
]);

/**
 * Turns a Supabase failure into an Error with a stable `code`.
 *
 * A database function's code is kept as is; anything else keeps the provider's
 * code (for example 42501 for a refused permission). The provider's message is
 * never used as the Error message, so it cannot leak onto a screen.
 */
export function toDataError(error) {
  const code = FUNCTION_CODES.has(error?.message)
    ? error.message
    : (error?.code ?? "unknown");
  const dataError = new Error(`Data request failed: ${code}`);

  dataError.code = code;
  dataError.cause = error;

  return dataError;
}

export function unwrap({ data, error }) {
  if (error) {
    throw toDataError(error);
  }

  return data;
}

export function toMillis(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}