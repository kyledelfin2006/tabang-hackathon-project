import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAuthGateway } from "../../src/services/auth/supabaseAuthGateway.js";
import { describeAuthError, GENERIC_CREDENTIAL_MESSAGE } from "../../src/services/auth/authErrors.js";
import { createAdvisoryRepository } from "../../src/services/advisories/advisoryRepository.js";
import { createIncidentRepository } from "../../src/services/incidents/incidentRepository.js";
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
  // Other tests leave older open incidents, so look this one up directly;
  // paging through the whole queue is covered by the REQ-023 test.
  assert.equal((await incidents.getIncident(reportId)).incidentStatus, "new");

  await incidents.claimIncident({ incidentId: reportId });
  await assert.rejects(
    createIncidentRepository({ client: rival.client }).claimIncident({ incidentId: reportId }),
    { code: "already_claimed" },
  );

  await incidents.transitionIncident({ incidentId: reportId, toStatus: "dispatched", note: "Boat sent." });

  const incident = await incidents.getIncident(reportId);
  assert.equal(incident.incidentStatus, "dispatched");
  assert.deepEqual(incident.assignedResponderIds, [responder.id]);
  assert.deepEqual(incident.preciseLocation, { latitude: 11.7061, longitude: 122.3648 });

  // REQ-024: the responder sees the photo through an expiring signed link.
  const [photoUrl] = await incidents.getPhotoUrls(incident.imagePaths);
  assert.match(photoUrl, /token=/);
  assert.equal((await fetch(photoUrl)).status, 200);

  await incidents.verifyIncident({ incidentId: reportId, verificationStatus: "verified" });
  assert.equal((await incidents.getIncident(reportId)).verificationStatus, "verified");

  const events = await incidents.listEvents(reportId);
  assert.deepEqual(
    events.map((event) => event.toStatus),
    ["acknowledged", "dispatched", "verified"],
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

  // REQ-026: the reviewer sees who applied and opens the ID through a link.
  assert.equal(item.applicantEmail, applicant.email);
  assert.equal(item.applicantName, "Test resident");
  const evidenceUrl = await reviews.getEvidenceUrl(item.identityDocumentPath);
  assert.equal((await fetch(evidenceUrl)).status, 200);

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

test("REQ-023: the queue pages to every open incident and counts match the database", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const reports = createReportRepository({ client: resident.client });
  const mine = new Set();

  for (let index = 0; index < 30; index += 1) {
    const reportId = randomUUID();

    mine.add(reportId);
    await reports.submitReport({ reportId, values: floodValues });
  }

  const incidents = createIncidentRepository({ client: responder.client });
  const seen = [];
  let cursor = null;

  do {
    const page = await incidents.listIncidents({ cursor });

    seen.push(...page.incidents.map((incident) => incident.id));
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);

  assert.equal(new Set(seen).size, seen.length, "no incident appears twice");
  assert.ok([...mine].every((id) => seen.includes(id)), "all 30 new incidents are reachable");

  const counts = await incidents.countIncidents();
  const admin = adminClient();
  const exact = async (filter) => {
    const { count, error } = await filter(
      admin
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("incident_status", ["new", "acknowledged", "dispatched", "on_scene"]),
    );

    assert.ifError(error);

    return count;
  };

  assert.equal(counts.openIncidents, await exact((query) => query));
  assert.equal(counts.unclaimed, await exact((query) => query.eq("assigned_responder_ids", "{}")));
  assert.equal(counts.verified, await exact((query) => query.eq("verification_status", "verified")));
  assert.equal(
    counts.awaitingVerification,
    await exact((query) => query.eq("verification_status", "pending")),
  );
  assert.equal(seen.length, counts.openIncidents, "the queue holds every open incident");
});

test("REQ-018: a responder publishes and unpublishes through the advisory repository", async () => {
  const responder = await createUser("responder");
  const advisories = createAdvisoryRepository({ client: responder.client });
  const summary = `Bridge closed until the water drops ${randomUUID()}`;

  await advisories.publishAdvisory({ summary, municipality: "Kalibo", barangay: "" });

  const [own] = await advisories.listOwnAdvisories(responder.id);
  assert.deepEqual(
    { summary: own.summary, municipality: own.municipality, source: own.source, published: own.published },
    { summary, municipality: "Kalibo", source: "tabang", published: true },
  );

  const publicView = createAdvisoryRepository({ client: anonymousClient() });
  assert.ok((await publicView.listRecentAdvisories()).some((item) => item.id === own.id));

  await advisories.unpublishAdvisory(own.id);
  assert.ok(!(await publicView.listRecentAdvisories()).some((item) => item.id === own.id));
  assert.equal((await advisories.listOwnAdvisories(responder.id))[0].published, false);
});

test("REQ-027: a rejected applicant reapplies through the application repository", async () => {
  const applicant = await createUser();
  const reviewer = await createUser("reviewer");
  const applications = createApplicationRepository({ client: applicant.client });
  const reviews = createReviewRepository({ client: reviewer.client });
  const values = { organization: "Kalibo MDRRMO", badgeNumber: "R-1024", municipality: "Kalibo" };

  async function apply() {
    const identity = await applications.uploadEvidence(photo());
    const selfie = await applications.uploadEvidence(photo());

    await applications.submitApplication({
      values,
      evidence: { identityDocumentPath: identity.path, selfiePath: selfie.path },
    });
  }

  await apply();

  const first = (await reviews.listPendingApplications()).find(
    (candidate) => candidate.applicantId === applicant.id,
  );

  await reviews.decide({ application: first, approve: false, notes: "Unreadable ID." });

  const rejected = await applications.getMyApplication(applicant.id);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewNotes, "Unreadable ID.");

  await apply();
  assert.equal((await applications.getMyApplication(applicant.id)).status, "pending");
});
