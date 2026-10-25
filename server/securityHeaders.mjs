/**
 * Builds the response headers for every request.
 *
 * The browser may only talk to this origin and the configured Supabase
 * project: data and auth calls go to its API, and report photos and evidence
 * are shown through its signed links. Without a configured URL the policy
 * allows this origin alone, which fails closed.
 */
export function buildSecurityHeaders({ supabaseUrl } = {}) {
  let supabaseOrigin = "";

  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabaseOrigin = "";
  }

  const withSupabase = (sources) =>
    [sources, supabaseOrigin].filter(Boolean).join(" ");

  return Object.freeze({
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      `img-src ${withSupabase("'self' data: blob:")}`,
      `connect-src ${withSupabase("'self'")}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
    "X-Frame-Options": "DENY",
  });
}