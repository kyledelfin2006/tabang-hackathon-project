const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Validates the Origin header and Content-Type for /api/app requests (CSRF defence).
 * State-changing methods (POST, PUT, PATCH, DELETE) require a matching Origin and JSON/image type.
 */
export function checkOrigin(req, { env = process.env, isUpload = false } = {}) {
  if (SAFE_METHODS.has(req.method)) {
    return { ok: true };
  }

  const origin = req.headers.origin;
  if (!origin) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Cross-site request forbidden: missing Origin header.",
    };
  }

  const expectedOrigin =
    env.APP_ORIGIN ||
    (req.headers.host ? `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}` : null);

  if (!expectedOrigin || origin !== expectedOrigin) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Cross-site request forbidden: origin mismatch.",
    };
  }

  const contentType = String(req.headers["content-type"] || "");

  if (isUpload) {
    const isImage = ALLOWED_IMAGE_TYPES.some((type) => contentType.startsWith(type));
    if (!isImage) {
      return {
        ok: false,
        status: 403,
        code: "forbidden",
        message: "Forbidden: upload must have image content type (JPEG, PNG, WebP).",
      };
    }
  } else {
    if (!contentType.startsWith("application/json")) {
      return {
        ok: false,
        status: 403,
        code: "forbidden",
        message: "Forbidden: request content type must be application/json.",
      };
    }
  }

  return { ok: true };
}
