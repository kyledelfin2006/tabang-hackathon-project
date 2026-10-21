import { describe, expect, it } from "vitest";
import {
  buildPublicSummary,
  validateFloodReport,
  validateHelpRequest,
} from "../services/reports/reportSchemas.js";
import {
  buildReportRow,
  createReportRepository,
} from "../services/reports/reportRepository.js";

const validFlood = {
  description: "The water reached the market road and is still rising fast.",
  municipality: "Kalibo",
  barangay: "Poblacion",
  landmark: "Beside the public market",
  contactPhone: "09171234567",
  latitude: "11.7061",
  longitude: "122.3648",
  severity: "knee",
};

const validHelp = {
  ...validFlood,
  severity: undefined,
  need: "rescue",
  peopleAffected: "4",
};

describe("report validation", () => {
  it("accepts a complete flood report", () => {
    const { isValid, values } = validateFloodReport(validFlood);

    expect(isValid).toBe(true);
    expect(values.kind).toBe("flood");
    expect(values.contactPhone).toBe("09171234567");
  });

  it("rejects coordinates outside the country", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      latitude: "51.5",
      longitude: "-0.12",
    });

    expect(errors.location).toBeDefined();
  });

  it("rejects a non-numeric coordinate", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      latitude: "somewhere near the bridge",
    });

    expect(errors.location).toBeDefined();
  });

  it("requires a severity for a flood report", () => {
    const { errors } = validateFloodReport({ ...validFlood, severity: "" });

    expect(errors.severity).toBeDefined();
  });

  it("rejects an unlisted severity", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      severity: "catastrophic",
    });

    expect(errors.severity).toBeDefined();
  });

  it("keeps help fields out of the flood schema", () => {
    const { values } = validateFloodReport({ ...validFlood, need: "rescue" });

    expect(values.need).toBeUndefined();
  });

  it("validates the help-specific fields", () => {
    const { isValid, values } = validateHelpRequest(validHelp);

    expect(isValid).toBe(true);
    expect(values.peopleAffected).toBe(4);

    expect(
      validateHelpRequest({ ...validHelp, peopleAffected: "0" }).errors
        .peopleAffected,
    ).toBeDefined();
    expect(
      validateHelpRequest({ ...validHelp, peopleAffected: "2.5" }).errors
        .peopleAffected,
    ).toBeDefined();
  });

  it("rejects a too-short description and a bad phone number", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      description: "flood",
      contactPhone: "12345",
    });

    expect(errors.description).toBeDefined();
    expect(errors.contactPhone).toBeDefined();
  });
});

describe("public summary", () => {
  it("never reuses the resident's own description", () => {
    const { values } = validateFloodReport({
      ...validFlood,
      description: "Call me at 09171234567, we are at 42 Rizal Street.",
    });
    const summary = buildPublicSummary(values);

    expect(summary).not.toMatch(/09171234567/);
    expect(summary).not.toMatch(/Rizal Street/);
    expect(summary).toContain("Poblacion, Kalibo");
    expect(summary).not.toContain("public market");
  });

  it("uses readable labels", () => {
    expect(buildPublicSummary(validateFloodReport(validFlood).values)).toBe(
      "Flooding reported in Poblacion, Kalibo (knee deep).",
    );
    expect(buildPublicSummary(validateHelpRequest(validHelp).values)).toBe(
      "Assistance requested in Poblacion, Kalibo (rescue or evacuation).",
    );
  });
});

describe("REQ-014: location without GPS", () => {
  it("accepts a report with a municipality and barangay and no coordinates", () => {
    const { isValid, values } = validateFloodReport({
      ...validFlood,
      latitude: "",
      longitude: "",
      landmark: "",
    });

    expect(isValid).toBe(true);
    expect(values).toMatchObject({
      municipality: "Kalibo",
      barangay: "Poblacion",
      landmark: "",
      latitude: null,
      longitude: null,
      publicLocationLabel: "Poblacion, Kalibo",
    });
  });

  it("requires a listed Aklan municipality and a barangay", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      municipality: "Quezon City",
      barangay: "  ",
    });

    expect(errors.municipality).toBeDefined();
    expect(errors.barangay).toBeDefined();
  });

  it("refuses half a coordinate pair and an overlong landmark", () => {
    const { errors } = validateFloodReport({
      ...validFlood,
      longitude: "",
      landmark: "x".repeat(121),
    });

    expect(errors.location).toBeDefined();
    expect(errors.landmark).toBeDefined();
  });
});

describe("report row", () => {
  it("keeps precise location and phone out of public fields", () => {
    const { values } = validateFloodReport(validFlood);
    const row = buildReportRow({
      reportId: "report-1",
      values,
      imagePaths: ["resident-1/report-1/photo.jpg"],
    });

    expect(row).toMatchObject({ latitude: 11.7061, longitude: 122.3648 });
    expect(row.contact_phone).toBe("09171234567");
    expect(row.public_summary).not.toContain("09171234567");
    expect(row.public_summary).not.toContain("11.7061");
    expect(row.image_paths).toEqual(["resident-1/report-1/photo.jpg"]);
  });

  it("never sends the fields the database sets itself", () => {
    const { values } = validateFloodReport(validFlood);
    const row = buildReportRow({ reportId: "report-1", values });

    // The database grants no insert on these, so it would refuse the row.
    for (const column of [
      "reporter_id",
      "priority",
      "verification_status",
      "incident_status",
      "assigned_responder_ids",
      "created_at",
      "updated_at",
    ]) {
      expect(row).not.toHaveProperty(column);
    }
  });

  it("keeps help fields and flood fields apart", () => {
    const flood = buildReportRow({ reportId: "a", values: validateFloodReport(validFlood).values });
    const help = buildReportRow({ reportId: "b", values: validateHelpRequest(validHelp).values });

    expect(flood).toMatchObject({ severity: "knee" });
    expect(flood).not.toHaveProperty("need");
    expect(help).toMatchObject({ need: "rescue", people_affected: 4 });
    expect(help).not.toHaveProperty("severity");
  });
});

describe("submission idempotency", () => {
  function repositoryAnswering(error) {
    const inserted = [];
    const client = {
      post: async (path, body) => {
        if (error) {
          const err = new Error(error.message || "failed");
          err.code = error.code;
          throw err;
        }
        inserted.push({
          id: body.id,
          image_paths: (body.images || []).map((img) => img.path),
          ...body.values,
        });
        return { reportId: body.id };
      },
    };

    return { inserted, repository: createReportRepository({ client }) };
  }

  const submission = {
    reportId: "report-1",
    values: validateFloodReport(validFlood).values,
    images: [{ path: "resident-1/report-1/photo.jpg" }],
  };

  it("writes the report at the form session's id", async () => {
    const { inserted, repository } = repositoryAnswering(null);

    await repository.submitReport(submission);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      id: "report-1",
      image_paths: ["resident-1/report-1/photo.jpg"],
    });
  });

  it("treats a retry of an already filed report as success", async () => {
    // A double click, or a retry after a timeout that actually succeeded.
    const { repository } = repositoryAnswering({ code: "23505", message: "duplicate key" });

    await expect(repository.submitReport(submission)).resolves.toEqual({ reportId: "report-1" });
  });

  it("surfaces any other failure without the provider's message", async () => {
    const { repository } = repositoryAnswering({ code: "42501", message: "permission denied for table reports" });

    await expect(repository.submitReport(submission)).rejects.toMatchObject({ code: "42501" });
    await expect(repository.submitReport(submission)).rejects.not.toThrow(/permission denied/);
  });
});
