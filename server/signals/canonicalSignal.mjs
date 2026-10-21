import { isKnownPlace } from "../../src/services/places/aklanPlaces.js";

export const SIGNAL_TYPES = Object.freeze([
  "tropical-cyclone-wind-signal",
  "rainfall-warning",
  "flood-advisory",
  "other",
]);

// ISO 8601 with an explicit offset, so a partner's local time is never
// guessed at.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SOURCE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function text(value, { max, required }) {
  if (value === undefined || value === null || value === "") {
    return required ? { error: "is required" } : { value: null };
  }

  if (typeof value !== "string") {
    return { error: "must be a string" };
  }

  const trimmed = value.trim();

  if (required && trimmed === "") {
    return { error: "is required" };
  }

  return trimmed.length > max ? { error: `must be at most ${max} characters` } : { value: trimmed || null };
}

function timestamp(value, { required }) {
  if (value === undefined || value === null) {
    return required ? { error: "is required" } : { value: null };
  }

  return typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))
    ? { value }
    : { error: "must be an ISO 8601 timestamp with an offset" };
}

/**
 * Validates an inbound hazard signal against the canonical schema.
 *
 * Pure: no database and no clock, so the same rules apply to any partner and
 * to the DOST adapter once its contract is known. Returns `{ value }` with the
 * normalized signal, or `{ errors }` naming each bad field.
 */
export function validateCanonicalSignal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: { body: "must be a JSON object" } };
  }

  const errors = {};
  const value = {};
  const fields = {
    externalId: text(input.externalId, { max: 128, required: true }),
    level: text(input.level, { max: 32, required: false }),
    headline: text(input.headline, { max: 200, required: true }),
    body: text(input.body, { max: 2000, required: false }),
    url: text(input.url, { max: 2048, required: false }),
    issuedAt: timestamp(input.issuedAt, { required: true }),
    expiresAt: timestamp(input.expiresAt, { required: false }),
  };

  for (const [name, result] of Object.entries(fields)) {
    if (result.error) {
      errors[name] = result.error;
    } else {
      value[name] = result.value;
    }
  }

  if (typeof input.source !== "string" || !SOURCE.test(input.source)) {
    errors.source = "must be lowercase letters, digits, and dashes, up to 64";
  } else {
    value.source = input.source;
  }

  if (!SIGNAL_TYPES.includes(input.type)) {
    errors.type = `must be one of ${SIGNAL_TYPES.join(", ")}`;
  } else {
    value.type = input.type;
  }

  if (value.url && !value.url.startsWith("https://")) {
    errors.url = "must be an https link";
  }

  if (value.issuedAt && value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    errors.expiresAt = "must be after issuedAt";
  }

  if (!Array.isArray(input.areas) || input.areas.length === 0 || input.areas.length > 50) {
    errors.areas = "must list between 1 and 50 areas";
  } else {
    const areas = [];

    for (const [index, area] of input.areas.entries()) {
      const municipality = typeof area?.municipality === "string" ? area.municipality.trim() : "";
      const barangay = typeof area?.barangay === "string" ? area.barangay.trim() : "";

      if (!isKnownPlace(municipality) || barangay.length > 80 || !isKnownPlace(municipality, barangay || undefined)) {
        errors[`areas[${index}]`] = "must name an Aklan municipality and, optionally, one of its barangays";
      } else {
        areas.push(barangay ? { municipality, barangay } : { municipality });
      }
    }

    value.areas = areas;
  }

  return Object.keys(errors).length > 0 ? { errors } : { value };
}

export function describeErrors(errors) {
  return Object.entries(errors)
    .map(([field, problem]) => `${field} ${problem}`)
    .join("; ");
}
