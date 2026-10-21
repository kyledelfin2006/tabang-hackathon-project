import {
  PHONE_PATTERN,
  collapseWhitespace as collapse,
  normalizePhone,
} from "../auth/profile.js";
import { barangaysFor, isKnownPlace } from "../places/aklanPlaces.js";

const MAX_DESCRIPTION = 1000;
const MAX_PLACE = 80;
const MAX_LANDMARK = 120;
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

export const SEVERITY_LABELS = Object.freeze({
  ankle: "Ankle deep",
  knee: "Knee deep",
  waist: "Waist deep",
  chest: "Chest deep",
  "above-head": "Above head height",
});

export const NEED_LABELS = Object.freeze({
  rescue: "Rescue or evacuation",
  medical: "Medical assistance",
  "food-water": "Food or drinking water",
  shelter: "Shelter",
  other: "Something else",
});

function readCoordinates(input, errors) {
  const rawLatitude = input.latitude ?? "";
  const rawLongitude = input.longitude ?? "";

  // Location from the phone is optional: GPS fails indoors, during power cuts,
  // and on older handsets, which is exactly when a flood report matters.
  if (rawLatitude === "" && rawLongitude === "") {
    return { latitude: null, longitude: null };
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (
    rawLatitude === "" ||
    rawLongitude === "" ||
    !Number.isFinite(latitude) ||
    latitude < COORDINATE_BOUNDS.minLatitude ||
    latitude > COORDINATE_BOUNDS.maxLatitude ||
    !Number.isFinite(longitude) ||
    longitude < COORDINATE_BOUNDS.minLongitude ||
    longitude > COORDINATE_BOUNDS.maxLongitude
  ) {
    errors.location =
      "The location from your phone does not look right. Try again or remove it.";

    return { latitude: null, longitude: null };
  }

  return { latitude, longitude };
}

function validateShared(input, errors) {
  const description = collapse(input.description);
  const municipality = collapse(input.municipality);
  const barangay = collapse(input.barangay);
  const landmark = collapse(input.landmark);
  const contactPhone = normalizePhone(input.contactPhone);

  if (description.length < MIN_DESCRIPTION) {
    errors.description = `Describe the situation in at least ${MIN_DESCRIPTION} characters.`;
  } else if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  }

  if (!isKnownPlace(municipality)) {
    errors.municipality = "Choose your municipality.";
  }

  if (!barangay) {
    errors.barangay =
      barangaysFor(municipality).length > 0
        ? "Choose your barangay."
        : "Enter your barangay.";
  } else if (
    barangay.length > MAX_PLACE ||
    !isKnownPlace(municipality, barangay)
  ) {
    errors.barangay = "Choose your barangay from the list.";
  }

  if (landmark.length > MAX_LANDMARK) {
    errors.landmark = `Keep the landmark under ${MAX_LANDMARK} characters.`;
  }

  if (!PHONE_PATTERN.test(contactPhone)) {
    errors.contactPhone = "Enter a mobile number responders can reach you on.";
  }

  return {
    description,
    municipality,
    barangay,
    landmark,
    // Barangay and municipality only: a landmark can identify a house, so it
    // stays with the protected fields.
    publicLocationLabel: `${barangay}, ${municipality}`,
    contactPhone,
    ...readCoordinates(input, errors),
  };
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
    ? `Flooding reported in ${values.publicLocationLabel} (${(SEVERITY_LABELS[values.severity] ?? values.severity).toLowerCase()}).`
    : `Assistance requested in ${values.publicLocationLabel} (${(NEED_LABELS[values.need] ?? values.need).toLowerCase()}).`;
}
