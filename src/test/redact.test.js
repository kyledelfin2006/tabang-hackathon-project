import { describe, expect, it } from "vitest";
import {
  buildSafeErrorReport,
  redactText,
  redactValue,
} from "../services/observability/redact.js";

describe("redaction", () => {
  it("removes the things a flood report leaks worst", () => {
    const text = redactText(
      "Call 09171234567, we are at 11.70612, 122.36481, resident@example.test",
    );

    expect(text).not.toMatch(/09171234567/);
    expect(text).not.toMatch(/11\.70612/);
    expect(text).not.toMatch(/resident@example\.test/);
  });

  it("removes identity evidence paths and tokens", () => {
    const text = redactText(
      "failed for tabang/responder-applications/resident-1/id with eyJhbGciOiJIUzI1NiIsInR5cCI6",
    );

    expect(text).not.toMatch(/responder-applications\/resident-1/);
    expect(text).not.toMatch(/eyJhbGci/);
  });

  it("drops sensitive fields by name, not only by pattern", () => {
    // A description is sensitive whether or not it looks sensitive.
    const redacted = redactValue({
      description: "Water rising by the school",
      publicLocationLabel: "Poblacion",
      preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
    });

    expect(redacted.description).toBe("[redacted]");
    expect(redacted.preciseLocation).toBe("[redacted]");
    // Non-sensitive fields survive, otherwise the log is useless.
    expect(redacted.publicLocationLabel).toBe("Poblacion");
  });

  it("reaches into nested structures", () => {
    const redacted = redactValue({
      report: { contactPhone: "09171234567", kind: "flood" },
    });

    expect(redacted.report.contactPhone).toBe("[redacted]");
    expect(redacted.report.kind).toBe("flood");
  });

  it("redacts an error message and its context together", () => {
    const report = buildSafeErrorReport(
      new Error("submit failed for 09171234567"),
      { contactPhone: "09171234567", reportId: "report-1" },
    );

    expect(report.message).not.toMatch(/09171234567/);
    expect(report.context.contactPhone).toBe("[redacted]");
    expect(report.context.reportId).toBe("report-1");
  });
});
