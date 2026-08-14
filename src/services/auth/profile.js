const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BARANGAY_LENGTH = 80;
const PHONE_PATTERN = /^(?:\+63|0)9\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

function collapseWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeEmail(rawEmail) {
  return typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
}

export function normalizePhone(rawPhone) {
  const compact =
    typeof rawPhone === "string" ? rawPhone.replace(/[\s()-]/g, "") : "";

  return compact.startsWith("+63") ? `0${compact.slice(3)}` : compact;
}

/**
 * Maps the inconsistent legacy profile field names onto one canonical shape.
 */
export function normalizeProfileRecord(rawProfile = {}) {
  return Object.freeze({
    displayName: collapseWhitespace(
      rawProfile.displayName ?? rawProfile.fullName ?? rawProfile.name ?? "",
    ),
    email: normalizeEmail(rawProfile.email ?? rawProfile.emailAddress ?? ""),
    phone: normalizePhone(
      rawProfile.phone ?? rawProfile.phoneNumber ?? rawProfile.contactNumber,
    ),
    barangay: collapseWhitespace(
      rawProfile.barangay ?? rawProfile.address ?? "",
    ),
  });
}

export function validateSignupInput(input = {}) {
  const values = {
    displayName: collapseWhitespace(input.displayName),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    barangay: collapseWhitespace(input.barangay),
    password: typeof input.password === "string" ? input.password : "",
    confirmPassword:
      typeof input.confirmPassword === "string" ? input.confirmPassword : "",
  };
  const errors = {};

  if (!values.displayName) {
    errors.displayName = "Enter your full name.";
  } else if (values.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    errors.displayName = `Use ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
  }

  if (!EMAIL_PATTERN.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!PHONE_PATTERN.test(values.phone)) {
    errors.phone = "Enter a Philippine mobile number, for example 09171234567.";
  }

  if (!values.barangay) {
    errors.barangay = "Enter your barangay.";
  } else if (values.barangay.length > MAX_BARANGAY_LENGTH) {
    errors.barangay = `Use ${MAX_BARANGAY_LENGTH} characters or fewer.`;
  }

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return { values, errors, isValid: Object.keys(errors).length === 0 };
}

export function validateLoginInput(input = {}) {
  const values = {
    email: normalizeEmail(input.email),
    password: typeof input.password === "string" ? input.password : "",
  };
  const errors = {};

  if (!EMAIL_PATTERN.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    errors.password = "Enter your password.";
  }

  return { values, errors, isValid: Object.keys(errors).length === 0 };
}

export function validateEmailOnlyInput(input = {}) {
  const values = { email: normalizeEmail(input.email) };
  const errors = {};

  if (!EMAIL_PATTERN.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }

  return { values, errors, isValid: Object.keys(errors).length === 0 };
}

export { MIN_PASSWORD_LENGTH, PHONE_PATTERN };
