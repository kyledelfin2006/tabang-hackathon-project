import { describe, expect, it } from "vitest";
import {
  buildPublicSummary,
  validateFloodReport,
  validateHelpRequest,
} from "../services/reports/reportSchemas.js";
import {
  buildReportDocument,
  createReportRepository,
} from "../services/reports/reportRepository.js";

const validFlood = {
  description: "The water reached the market road and is still rising fast.",
  publicLocationLabel: "Poblacion, Kalibo",
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
  });
});

describe("report document", () => {
  it("keeps precise location and phone out of public fields", () => {
    const { values } = validateFloodReport(validFlood);
    const document = buildReportDocument({
      reporterId: "resident-1",
      values,
      images: [{ publicId: "tabang/reports/resident-1/abc" }],
    });

    expect(document.preciseLocation).toEqual({
      latitude: 11.7061,
      longitude: 122.3648,
    });
    expect(document.contactPhone).toBe("09171234567");
    expect(document.publicSummary).not.toContain("09171234567");
    expect(document.publicSummary).not.toContain("11.7061");
    // Originals stay protected until a responder publishes a derivative.
    expect(document.publicImagePaths).toEqual([]);
    expect(document.imagePaths).toEqual(["tabang/reports/resident-1/abc"]);
  });

  it("starts every report in the pending, unassigned state", () => {
    const { values } = validateFloodReport(validFlood);
    const document = buildReportDocument({
      reporterId: "resident-1",
      values,
      images: [],
    });

    expect(document.verificationStatus).toBe("pending");
    expect(document.incidentStatus).toBe("new");
    expect(document.assignedResponderIds).toBeUndefined();
  });

  it("uses a server timestamp rather than the device clock", () => {
    const { values } = validateFloodReport(validFlood);
    const document = buildReportDocument({
      reporterId: "resident-1",
      values,
      images: [],
    });

    expect(typeof document.createdAt).toBe("object");
    expect(document.createdAt).not.toBeInstanceOf(Date);
  });
});

describe("submission idempotency", () => {
  function repositoryWithStore(store) {
    const transaction = {
      get: async (reference) => ({ exists: () => store.has(reference.path) }),
      set: (reference, data) => store.set(reference.path, data),
    };

    return createReportRepository({
      db: {},
      documentRef: (_db, collection, id) => ({ path: `${collection}/${id}` }),
      transactionRunner: (_db, work) => work(transaction),
    });
  }

  it("writes the report once", async () => {
    const store = new Map();

    await repositoryWithStore(store).submitReport({
      reportId: "report-1",
      reporterId: "resident-1",
      values: validateFloodReport(validFlood).values,
      images: [],
    });

    expect(store.size).toBe(1);
    expect(store.get("reports/report-1").reporterId).toBe("resident-1");
  });

  it("does not file a second report when the same id is retried", async () => {
    const store = new Map();
    const repository = repositoryWithStore(store);
    const submission = {
      reportId: "report-1",
      reporterId: "resident-1",
      values: validateFloodReport(validFlood).values,
      images: [],
    };

    await repository.submitReport(submission);
    const firstWrite = store.get("reports/report-1");

    // A double click, or a retry after a timeout that actually succeeded.
    await repository.submitReport(submission);
    await repository.submitReport(submission);

    expect(store.size).toBe(1);
    expect(store.get("reports/report-1")).toBe(firstWrite);
  });

  it("files separate reports for separate form sessions", async () => {
    const store = new Map();
    const repository = repositoryWithStore(store);
    const values = validateFloodReport(validFlood).values;

    await repository.submitReport({
      reportId: "report-1",
      reporterId: "resident-1",
      values,
      images: [],
    });
    await repository.submitReport({
      reportId: "report-2",
      reporterId: "resident-1",
      values,
      images: [],
    });

    expect(store.size).toBe(2);
  });
});
