import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  normalizeProfileRecord,
  validateSignupInput,
} from "../services/auth/profile.js";
import {
  ROLES,
  homeRouteForRole,
  isResponderRole,
  isReviewerRole,
  normalizeRole,
} from "../services/auth/roles.js";
import { describeAuthError } from "../services/auth/authErrors.js";

describe("profile normalization", () => {
  it("maps the inconsistent legacy field names onto one shape", () => {
    expect(
      normalizeProfileRecord({
        fullName: "  Ana   Cruz ",
        emailAddress: "Ana@Example.TEST",
        contactNumber: "+63 917 123 4567",
        address: " Poblacion ",
      }),
    ).toEqual({
      displayName: "Ana Cruz",
      email: "ana@example.test",
      phone: "09171234567",
      barangay: "Poblacion",
    });
  });

  it("lower-cases and trims email addresses", () => {
    expect(normalizeEmail("  Resident@Example.TEST ")).toBe(
      "resident@example.test",
    );
  });

  it("normalizes the +63 prefix to the local 0 prefix", () => {
    expect(normalizePhone("+63 917-123-4567")).toBe("09171234567");
  });

  it("rejects a malformed mobile number", () => {
    const { errors } = validateSignupInput({
      displayName: "Ana Cruz",
      email: "ana@example.test",
      phone: "12345",
      barangay: "Poblacion",
      password: "flood-ready-2026",
      confirmPassword: "flood-ready-2026",
    });

    expect(errors.phone).toBeDefined();
  });
});

describe("role helpers", () => {
  it("falls back to resident for unknown roles", () => {
    expect(normalizeRole("superuser")).toBe(ROLES.resident);
    expect(normalizeRole(undefined)).toBe(ROLES.resident);
  });

  it("treats reviewers and admins as responders", () => {
    expect(isResponderRole(ROLES.responder)).toBe(true);
    expect(isResponderRole(ROLES.reviewer)).toBe(true);
    expect(isResponderRole(ROLES.admin)).toBe(true);
    expect(isResponderRole(ROLES.resident)).toBe(false);
  });

  it("restricts reviewer powers to reviewers and admins", () => {
    expect(isReviewerRole(ROLES.responder)).toBe(false);
    expect(isReviewerRole(ROLES.reviewer)).toBe(true);
  });

  it("routes each role to its home", () => {
    expect(homeRouteForRole(ROLES.resident)).toBe("/app");
    expect(homeRouteForRole(ROLES.responder)).toBe("/responder");
  });
});

describe("auth error messages", () => {
  it("uses one message for every credential failure", () => {
    const messages = new Set(
      [
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential",
        "auth/invalid-email",
      ].map((code) => describeAuthError({ code })),
    );

    expect(messages.size).toBe(1);
  });

  it("does not confirm that an email is already registered", () => {
    expect(describeAuthError({ code: "auth/email-already-in-use" })).not.toMatch(
      /already (has|exists|registered)/i,
    );
  });
});
