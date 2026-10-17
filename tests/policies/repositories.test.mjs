import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAuthGateway } from "../../src/services/auth/supabaseAuthGateway.js";
import { describeAuthError, GENERIC_CREDENTIAL_MESSAGE } from "../../src/services/auth/authErrors.js";
import {
  AlreadyClaimedError,
  createIncidentRepository,
} from "../../src/services/incidents/incidentRepository.js";
import { createHotlineRepository } from "../../src/services/hotlines/hotlineRepository.js";
import {
  REPORT_PAGE_SIZE,
  createReportRepository,
} from "../../src/services/reports/reportRepository.js";
import { validateFloodReport } from "../../src/services/reports/reportSchemas.js";
import { createApplicationRepository } from "../../src/services/responders/applicationRepository.js";
import { createReviewRepository } from "../../src/services/responders/reviewRepository.js";
import { createStorageUploader } from "../../src/services/uploads/storageUploader.js";
import { PASSWORD, adminClient, anonymousClient, assertOk, createUser } from "./helpers/clients.mjs";
import { PNG_BYTES } from "./helpers/files.mjs";

// These drive the application's own adapters against the local database, so
// a mismatch between what the client sends and what the policies accept fails
// here rather than in front of a resident.

const floodValues = validateFloodReport({
  description: "The water reached the market road and is still rising fast.",
  municipality: "Kalibo",
  barangay: "Poblacion",
  landmark: "Beside the public market",
  contactPhone: "09171234567",
  latitude: "11.7061",
  longitude: "122.3648",
  severity: "knee",
}).values;

function photo() {
  return new File([PNG_BYTES], "photo.png", { type: "image/png" });
}

test("REQ-005: a resident's report from the real client path is claimed by a responder", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const rival = await createUser("responder");
  const reportId = randomUUID();

  const uploaded = await createStorageUploader({ client: resident.client }).upload(photo(), {
    reporterId: resident.id,
    reportId,
  });
  const reports = createReportRepository({ client: resident.client });
  const submission = { reportId, values: floodValues, images: [uploaded] };

  await reports.submitReport(submission);
  // A retry with the same id is a success, not a second report.
  await reports.submitReport(submission);

  const incidents = createIncidentRepository({ client: responder.client });
  const queue = await incidents.listIncidents();
  assert.ok(queue.some((incident) => incident.id === reportId));

  await incidents.claimIncident({ incidentId: reportId });
  await assert.rejects(
    createIncidentRepository({ client: rival.client }).claimIncident({ incidentId: reportId }),
    AlreadyClaimedError,
  );

  await incidents.transitionIncident({ incidentId: reportId, toStatus: "dispatched", note: "Boat sent." });

  const incident = await incidents.getIncident(reportId);
  assert.equal(incident.incidentStatus, "dispatched");
  assert.deepEqual(incident.assignedResponderIds, [responder.id]);
  assert.deepEqual(incident.preciseLocation, { latitude: 11.7061, longitude: 122.3648 });

  const events = await incidents.listEvents(reportId);
  assert.deepEqual(
    events.map((event) => event.toStatus),
    ["acknowledged", "dispatched"],
  );

  const stored = assertOk(
    await resident.client.from("reports").select("image_paths").eq("id", reportId).single(),
  );
  assert.deepEqual(stored.image_paths, [uploaded.path]);
});

test("REQ-014: a report without GPS keeps its municipality, barangay, and landmark", async () => {
  const resident = await createUser();
  const reports = createReportRepository({ client: resident.client });
  const values = validateFloodReport({
    description: "The water reached the market road and is still rising fast.",
    municipality: "Numancia",
    barangay: "Poblacion",
    landmark: "Near the chapel",
    contactPhone: "09171234567",
    severity: "waist",
  }).values;
  const reportId = randomUUID();

  await reports.submitReport({ reportId, values });

  const [report] = (await reports.listMyReports({ reporterId: resident.id })).reports;
  assert.deepEqual(
    {
      municipality: report.municipality,
      barangay: report.barangay,
      landmark: report.landmark,
      canCancel: report.canCancel,
    },
    { municipality: "Numancia", barangay: "Poblacion", landmark: "Near the chapel", canCancel: true },
  );

  const stored = assertOk(
    await resident.client.from("reports").select("latitude, longitude, public_summary").eq("id", reportId).single(),
  );
  assert.deepEqual(stored, {
    latitude: null,
    longitude: null,
    public_summary: "Flooding reported in Poblacion, Numancia (waist deep).",
  });
});

test("my reports pages through every report exactly once", async () => {
  const resident = await createUser();
  const reports = createReportRepository({ client: resident.client });
  const total = REPORT_PAGE_SIZE + 2;

  for (let index = 0; index < total; index += 1) {
    await reports.submitReport({ reportId: randomUUID(), values: floodValues });
  }

  const first = await reports.listMyReports({ reporterId: resident.id });
  const second = await reports.listMyReports({ reporterId: resident.id, cursor: first.cursor });
  const ids = [...first.reports, ...second.reports].map((report) => report.id);

  assert.equal(first.reports.length, REPORT_PAGE_SIZE);
  assert.equal(first.hasMore, true);
  assert.equal(second.reports.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(new Set(ids).size, total);

  await reports.cancelReport({ reportId: ids[0] });
  const [latest] = (await reports.listMyReports({ reporterId: resident.id })).reports;
  assert.equal(latest.isCancelled, true);
});

test("ratings and reviews through the hotline repository", async () => {
  const id = `test-${randomUUID()}`;
  assertOk(await adminClient().from("hotlines").insert({ id, organization: "Test office", phone_numbers: ["911"] }));

  const resident = await createUser();
  const hotlines = createHotlineRepository({ client: resident.client });

  await hotlines.submitReview({ hotlineId: id, rating: 3, comment: "" });
  await hotlines.submitReview({ hotlineId: id, rating: 5, comment: "Answered." });

  const listed = (await createHotlineRepository({ client: anonymousClient() }).listHotlines()).find(
    (hotline) => hotline.id === id,
  );
  assert.equal(listed.ratingCount, 1);
  assert.equal(listed.averageRating, 5);
  assert.deepEqual(await hotlines.getMyReview({ hotlineId: id, uid: resident.id }), {
    rating: 5,
    comment: "Answered.",
  });
});

test("an application from upload to decision with evidence deleted", async () => {
  const applicant = await createUser();
  const reviewer = await createUser("reviewer");
  const applications = createApplicationRepository({ client: applicant.client });

  const identity = await applications.uploadEvidence(photo());
  const selfie = await applications.uploadEvidence(photo());

  await applications.submitApplication({
    values: { organization: "Kalibo MDRRMO", badgeNumber: "R-1024", municipality: "Kalibo" },
    evidence: { identityDocumentPath: identity.path, selfiePath: selfie.path },
  });
  assert.equal((await applications.getMyApplication(applicant.id)).status, "pending");

  const reviews = createReviewRepository({ client: reviewer.client });
  const item = (await reviews.listPendingApplications()).find(
    (candidate) => candidate.applicantId === applicant.id,
  );

  assert.deepEqual(await reviews.decide({ application: item, approve: true, notes: "Checked." }), {
    evidenceDeleted: true,
  });
  assert.equal((await applications.getMyApplication(applicant.id)).status, "approved");
});

function nextSession(gateway) {
  return new Promise((resolve) => {
    const stop = gateway.observeSession((session) => {
      stop();
      resolve(session);
    });
  });
}

test("REQ-041: accounts sign up, sign in, sign out, and request a reset", async () => {
  const client = anonymousClient();
  const gateway = createAuthGateway({ client });
  const email = `signup-${randomUUID()}@tabang.test`;

  await gateway.register({
    email,
    password: PASSWORD,
    displayName: "Maria Santos",
    phone: "09171234567",
    barangay: "Andagao",
  });

  const session = await nextSession(gateway);
  assert.equal(session.user.email, email);
  assert.equal(session.role, "resident");
  assert.deepEqual(session.profile, {
    displayName: "Maria Santos",
    email,
    phone: "09171234567",
    barangay: "Andagao",
  });

  await gateway.signOut();
  assert.equal(await nextSession(gateway), null);

  const wrong = await gateway.signIn({ email, password: "not-the-password" }).catch((error) => error);
  assert.equal(describeAuthError(wrong), GENERIC_CREDENTIAL_MESSAGE);

  await gateway.signIn({ email, password: PASSWORD });
  assert.equal((await nextSession(gateway)).user.email, email);

  await gateway.updateOwnProfile(session.user.uid, {
    displayName: "Maria S. Santos",
    phone: "09998887777",
    barangay: "Estancia",
  });
  assert.equal((await nextSession(gateway)).profile.barangay, "Estancia");

  await gateway.signOut();
  await gateway.sendPasswordReset(email);
});

test("REQ-020: a sign-out during a session build leaves the user signed out", async () => {
  const user = await createUser();
  const client = anonymousClient();
  const gateway = createAuthGateway({ client });
  const seen = [];
  let pending = 0;

  const stop = gateway.observeSession((session) => seen.push(session), {
    onPending: () => {
      pending += 1;
    },
  });

  await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  await client.auth.signOut();
  await new Promise((resolve) => setTimeout(resolve, 500));
  stop();

  assert.ok(pending >= 1, "the sign-in was announced before its session was built");
  assert.equal(seen.at(-1), null);
  assert.ok(seen.every((session) => session === null), "the stale signed-in build was dropped");
});
