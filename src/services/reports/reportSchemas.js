import { normalizePhone } from "../auth/profile.js";

const PHONE_PATTERN = /^(?:\+63|0)9\d{9}$/;
const MAX_DESCRIPTION = 1000;
const MAX_LABEL = 120;
const MIN_DESCRIPTION = 10;

// Aklan sits well inside these bounds; anything outside is a bad reading.
export const COORDINATE_BOUNDS = Object.freeze({
  minLatitude: 4.5,
  maxLatitude: 21.5,
  minLongitude: 116,
  maxLongitude: 127,
});

export const FLOOD_SEVERITIES = Object.freeze([
  "ankle",
  "knee",
  "waist",
  "chest",
  "above-head",
]);

export const HELP_NEEDS = Object.freeze([
  "rescue",
  "medical",
  "food-water",
  "shelter",
  "other",
]);

export const REPORT_KINDS = Object.freeze(["flood", "help"]);

function collapse(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function validateShared(input, errors) {
  const description = collapse(input.description);
  const publicLocationLabel = collapse(input.publicLocationLabel);
  const contactPhone = normalizePhone(input.contactPhone);
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (description.length < MIN_DESCRIPTION) {
    errors.description = `Describe the situation in at least ${MIN_DESCRIPTION} characters.`;
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  }

  if (!publicLocationLabel) {
    errors.publicLocationLabel = "Name the barangay or landmark.";
  } else if (publicLocationLabel.length > MAX_LABEL) {
    errors.publicLocationLabel = `Keep the location under ${MAX_LABEL} characters.`;
  }

  if (!PHONE_PATTERN.test(contactPhone)) {
    errors.contactPhone = "Enter a mobile number responders can reach you on.";
  }

  if (
    !Number.isFinite(latitude) ||
    latitude < COORDINATE_BOUNDS.minLatitude ||
    latitude > COORDINATE_BOUNDS.maxLatitude ||
    !Number.isFinite(longitude) ||
    longitude < COORDINATE_BOUNDS.minLongitude ||
    longitude > COORDINATE_BOUNDS.maxLongitude
  ) {
    errors.location =
      "Pick a location on the map or allow location access so responders can find you.";
  }

  return { description, publicLocationLabel, contactPhone, latitude, longitude };
}

/**
 * Flood and help reports keep separate schemas on purpose: merging them was
 * what let the legacy pages write inconsistent shapes into two collections.
 */
export function validateFloodReport(input = {}) {
  const errors = {};
  const shared = validateShared(input, errors);
  const severity = collapse(input.severity);

  if (!FLOOD_SEVERITIES.includes(severity)) {
    errors.severity = "Choose how deep the water is.";
  }

  return {
    values: { ...shared, kind: "flood", severity },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateHelpRequest(input = {}) {
  const errors = {};
  const shared = validateShared(input, errors);
  const need = collapse(input.need);
  const peopleAffected = Number(input.peopleAffected);

  if (!HELP_NEEDS.includes(need)) {
    errors.need = "Choose the kind of help you need.";
  }

  if (
    !Number.isInteger(peopleAffected) ||
    peopleAffected < 1 ||
    peopleAffected > 200
  ) {
    errors.peopleAffected = "Enter how many people need help, from 1 to 200.";
  }

  return {
    values: { ...shared, kind: "help", need, peopleAffected },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateReport(kind, input) {
  return kind === "help"
    ? validateHelpRequest(input)
    : validateFloodReport(input);
}

/**
 * Builds the short, non-identifying summary that may appear publicly.
 *
 * The resident's own description is never promoted: it routinely contains
 * house numbers, names, and phone numbers. A responder publishes a reviewed
 * summary separately.
 */
export function buildPublicSummary(values) {
  return values.kind === "flood"
    ? `Flooding reported in ${values.publicLocationLabel} (${values.severity}-deep).`
    : `Assistance requested in ${values.publicLocationLabel} (${values.need}).`;
}
