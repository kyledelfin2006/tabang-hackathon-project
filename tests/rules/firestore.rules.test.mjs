import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import {
  cleanupRulesTestEnvironment,
  getRulesTestEnvironment,
  resetRulesTestEnvironment,
} from "./helpers/testEnvironment.mjs";

const sampleTimestamp = Timestamp.fromDate(new Date("2026-08-14T00:00:00Z"));

function buildReport(reporterId = "resident-1") {
  return {
    reporterId,
    kind: "flood",
    publicLocationLabel: "Kalibo town proper",
    preciseLocation: {
      latitude: 11.7061,
      longitude: 122.3648,
    },
    description: "Floodwater is rising near the market road.",
    publicSummary: "Floodwater rising near market road.",
    contactPhone: "09123456789",
    imagePaths: [`reportUploads/${reporterId}/report-1/original.jpg`],
    publicImagePaths: [],
    priority: "high",
    verificationStatus: "pending",
    incidentStatus: "new",
    createdAt: sampleTimestamp,
    updatedAt: sampleTimestamp,
  };
}

function buildManagedReport(reporterId = "resident-1") {
  return {
    ...buildReport(reporterId),
    assignedResponderIds: [],
    acknowledgedAt: null,
    resolvedAt: null,
  };
}

async function seedDocument(pathSegments, data) {
  const testEnvironment = await getRulesTestEnvironment();

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), ...pathSegments), data);
  });
}

describe("Firestore rules", () => {
  let testEnvironment;

  before(async () => {
    testEnvironment = await getRulesTestEnvironment();
  });

  beforeEach(async () => {
    await resetRulesTestEnvironment();
  });

  after(async () => {
    await cleanupRulesTestEnvironment();
  });

  it("blocks signed-out users from reading personal reports", async () => {
    await seedDocument(["reports", "report-1"], buildReport());

    const guestDb = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(guestDb, "reports", "report-1")));
  });

  it("lets residents create their own reports but rejects forged reporter IDs", async () => {
    const residentDb = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .firestore();

    await assertSucceeds(
      setDoc(doc(residentDb, "reports", "report-1"), buildReport("resident-1")),
    );

    await assertFails(
      setDoc(doc(residentDb, "reports", "report-2"), buildReport("resident-2")),
    );
  });

  it("limits resident updates on their own reports and denies self-promotion", async () => {
    await seedDocument(["reports", "report-1"], buildManagedReport("resident-1"));
    await seedDocument(["users", "resident-1"], {
      displayName: "Resident One",
      role: "resident",
    });

    const residentDb = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .firestore();

    const allowedResidentEdit = {
      ...buildManagedReport("resident-1"),
      publicSummary: "Floodwater now covers the main lane.",
      updatedAt: sampleTimestamp,
    };

    await assertSucceeds(
      setDoc(doc(residentDb, "reports", "report-1"), allowedResidentEdit),
    );

    await assertFails(
      setDoc(doc(residentDb, "reports", "report-1"), {
        ...allowedResidentEdit,
        assignedResponderIds: ["responder-1"],
      }),
    );

    await assertFails(
      setDoc(doc(residentDb, "users", "resident-1"), {
        displayName: "Resident One",
        role: "responder",
      }),
    );
  });

  it("lets only trusted responders read protected incident details", async () => {
    await seedDocument(["reports", "report-1"], buildReport("resident-1"));

    const responderDb = testEnvironment
      .authenticatedContext("responder-1", { role: "responder" })
      .firestore();
    const otherResidentDb = testEnvironment
      .authenticatedContext("resident-2", { role: "resident" })
      .firestore();

    await assertSucceeds(getDoc(doc(responderDb, "reports", "report-1")));
    await assertFails(getDoc(doc(otherResidentDb, "reports", "report-1")));
  });

  it("lets responders append incident events but never rewrite history", async () => {
    await seedDocument(["reports", "report-1"], buildReport("resident-1"));
    await seedDocument(["reports", "report-1", "events", "event-1"], {
      actorId: "responder-1",
      actorRole: "responder",
      type: "status-change",
      fromStatus: "new",
      toStatus: "acknowledged",
      note: "Initial acknowledgement recorded.",
      createdAt: sampleTimestamp,
    });

    const responderDb = testEnvironment
      .authenticatedContext("responder-1", { role: "responder" })
      .firestore();

    await assertSucceeds(
      setDoc(doc(responderDb, "reports", "report-1", "events", "event-2"), {
        actorId: "responder-1",
        actorRole: "responder",
        type: "status-change",
        fromStatus: "new",
        toStatus: "acknowledged",
        note: "Responder acknowledged the incident.",
        createdAt: sampleTimestamp,
      }),
    );

    await assertFails(
      updateDoc(doc(responderDb, "reports", "report-1", "events", "event-1"), {
        note: "Rewritten timeline entry.",
      }),
    );
  });

  it("allows only reviewers or admins to approve responder applications", async () => {
    await seedDocument(["responderApplications", "resident-1"], {
      applicantId: "resident-1",
      organization: "Aklan MDRRMO",
      status: "pending",
      submittedAt: sampleTimestamp,
    });

    const reviewerDb = testEnvironment
      .authenticatedContext("reviewer-1", { role: "reviewer" })
      .firestore();
    const residentDb = testEnvironment
      .authenticatedContext("resident-1", { role: "resident" })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(reviewerDb, "responderApplications", "resident-1"), {
        status: "approved",
        reviewedAt: sampleTimestamp,
        reviewedBy: "reviewer-1",
        reviewNotes: "Badge number and organization verified.",
      }),
    );

    await assertFails(
      updateDoc(doc(residentDb, "responderApplications", "resident-1"), {
        status: "approved",
      }),
    );
  });

  it("exposes only sanitized public feed content to public users", async () => {
    await seedDocument(["publicFeed", "item-1"], {
      summary: "Floodwater rising in a public zone.",
      barangay: "Poblacion",
      kind: "flood",
      createdAt: sampleTimestamp,
    });
    await seedDocument(["reports", "report-1"], buildReport("resident-1"));

    const guestDb = testEnvironment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(guestDb, "publicFeed", "item-1")));
    await assertFails(getDoc(doc(guestDb, "reports", "report-1")));
  });
});
