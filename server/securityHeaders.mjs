/**
 * Builds the response headers for every request.
 *
 * The browser may talk only to its own origin: data, auth, report photos,
 * and evidence all go through Tabang's own API.
 */
export function buildSecurityHeaders() {
  return Object.freeze({
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self' blob: data:",
      "connect-src 'self'",
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
