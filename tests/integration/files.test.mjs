import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closePool } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { startTestServer } from "../server/testServer.mjs";
import { createApiClient, createSignedInUser } from "./helpers/appClient.mjs";
import { PNG_BYTES } from "./helpers/files.mjs";
import { resolveFilePath } from "../../server/files.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-009: report photos are private to the reporter and responders", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-photos-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const reporter = await createSignedInUser(server, { role: "resident" });
  const responder = await createSignedInUser(server, { role: "responder" });
  const stranger = await createSignedInUser(server, { role: "resident" });
  const anonClient = createApiClient(server);

  const reportId = randomUUID();

  // Reporter uploads a photo for their report
  const uploadRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(uploadRes.status, 200);
  assert.ok(uploadRes.body.path);
  const photoPath = uploadRes.body.path;

  // 1. Reporter can view photo
  const reporterView = await reporter.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(reporterView.status, 200);
  assert.equal(reporterView.headers["content-type"], "image/png");
  assert.equal(reporterView.headers["cache-control"], "private, no-store");
  assert.equal(reporterView.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(reporterView.buffer, PNG_BYTES);

  // 2. Responder can view photo
  const responderView = await responder.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(responderView.status, 200);
  assert.deepEqual(responderView.buffer, PNG_BYTES);

  // 3. Unrelated resident gets 404
  const strangerView = await stranger.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(strangerView.status, 404);

  // 4. Anonymous visitor gets 404
  const anonView = await anonClient.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(anonView.status, 404);
});

test("REQ-009: identity evidence is private to the applicant and reviewers", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-evidence-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const applicant = await createSignedInUser(server, { role: "resident" });
  const reviewer = await createSignedInUser(server, { role: "reviewer" });
  const responder = await createSignedInUser(server, { role: "responder" });
  const stranger = await createSignedInUser(server, { role: "resident" });
  const anonClient = createApiClient(server);

  // Applicant uploads evidence
  const uploadRes = await applicant.client.post(
    "/api/app/files/identity-evidence",
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(uploadRes.status, 200);
  assert.ok(uploadRes.body.path);
  const evidencePath = uploadRes.body.path;

  // 1. Applicant can view evidence
  const applicantView = await applicant.client.get(`/api/app/files/identity-evidence/${evidencePath}`);
  assert.equal(applicantView.status, 200);
  assert.equal(applicantView.headers["content-type"], "image/png");
  assert.equal(applicantView.headers["cache-control"], "private, no-store");
  assert.equal(applicantView.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(applicantView.buffer, PNG_BYTES);

  // 2. Reviewer can view evidence
  const reviewerView = await reviewer.client.get(`/api/app/files/identity-evidence/${evidencePath}`);
  assert.equal(reviewerView.status, 200);
  assert.deepEqual(reviewerView.buffer, PNG_BYTES);

  // 3. Responder gets 404 (responders cannot view identity evidence)
  const responderView = await responder.client.get(`/api/app/files/identity-evidence/${evidencePath}`);
  assert.equal(responderView.status, 404);

  // 4. Unrelated resident gets 404
  const strangerView = await stranger.client.get(`/api/app/files/identity-evidence/${evidencePath}`);
  assert.equal(strangerView.status, 404);

  // 5. Anonymous visitor gets 404
  const anonView = await anonClient.get(`/api/app/files/identity-evidence/${evidencePath}`);
  assert.equal(anonView.status, 404);
});

test("REQ-009: a user cannot upload a photo to another user's report", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-ownership-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const reporter = await createSignedInUser(server, { role: "resident" });
  const otherUser = await createSignedInUser(server, { role: "resident" });

  const reportId = randomUUID();

  // Create report by reporter
  const createReportRes = await reporter.client.post("/api/app/reports", {
    id: reportId,
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      landmark: "Near bridge",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Flooding near market reached knee level.",
      contactPhone: "09171234567",
      latitude: 11.7,
      longitude: 122.36,
      severity: "knee",
    },
  });
  assert.equal(createReportRes.status, 200);

  // Other user attempts to upload photo to reporter's report -> 403 Forbidden
  const forbiddenUpload = await otherUser.client.post(
    `/api/app/files/report-photos/${reportId}`,
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(forbiddenUpload.status, 403);
  assert.equal(forbiddenUpload.body.error.code, "forbidden");
});

test("REQ-009: non-image, mismatched bytes, and oversized files are refused", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-refused-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const reporter = await createSignedInUser(server, { role: "resident" });
  const reportId = randomUUID();

  // 1. Non-image content-type (text/plain) -> refused
  const textRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    Buffer.from("hello world"),
    { headers: { "content-type": "text/plain" } },
  );
  assert.ok([400, 403].includes(textRes.status));

  // 2. Non-image content-type (application/pdf) -> refused
  const pdfRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    Buffer.from("%PDF-1.7"),
    { headers: { "content-type": "application/pdf" } },
  );
  assert.ok([400, 403].includes(pdfRes.status));

  // 3. Claimed image/png, but bytes are plain text -> refused (400)
  const mismatchRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    Buffer.from("not really a png"),
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(mismatchRes.status, 400);
  assert.equal(mismatchRes.body.error.code, "invalid_request");

  // 4. Oversized file (> 5 MB) -> refused (413)
  const hugeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
  const hugeRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    hugeBuffer,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(hugeRes.status, 413);
  assert.equal(hugeRes.body.error.code, "invalid_request");
});

test("REQ-009: path traversal and encoded separators return 404", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-traversal-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const user = await createSignedInUser(server, { role: "reviewer" });

  // Directory traversal in report photos
  const trav1 = await user.client.get("/api/app/files/report-photos/..%2fsecret");
  assert.equal(trav1.status, 404);

  const trav2 = await user.client.get("/api/app/files/report-photos/%2e%2e/photo.png");
  assert.equal(trav2.status, 404);

  const trav3 = await user.client.get("/api/app/files/report-photos/a%2fb/c/d.png");
  assert.equal(trav3.status, 404);

  // Directory traversal in identity evidence
  const trav4 = await user.client.get("/api/app/files/identity-evidence/%2e%2e%2fsecret.png");
  assert.equal(trav4.status, 404);
});

test("REQ-009: reviewers delete applicant evidence after a decision", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-decision-del-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const applicant = await createSignedInUser(server, { role: "resident" });
  const reviewer = await createSignedInUser(server, { role: "reviewer" });

  // 1. Upload evidence
  const idDoc = await applicant.client.post(
    "/api/app/files/identity-evidence",
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(idDoc.status, 200);

  const selfie = await applicant.client.post(
    "/api/app/files/identity-evidence",
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(selfie.status, 200);

  // 2. Submit application
  const appRes = await applicant.client.post("/api/app/applications", {
    values: {
      organization: "Kalibo Red Cross",
      badgeNumber: "RC-4040",
      municipality: "Kalibo",
      consentAccepted: true,
    },
    evidence: {
      identityDocumentPath: idDoc.body.path,
      selfiePath: selfie.body.path,
    },
  });
  assert.equal(appRes.status, 200);

  // Reviewer can view evidence prior to decision
  const beforeDec = await reviewer.client.get(`/api/app/files/identity-evidence/${idDoc.body.path}`);
  assert.equal(beforeDec.status, 200);

  // 3. Reviewer decides application
  const decideRes = await reviewer.client.post(
    `/api/app/applications/${applicant.id}/decision`,
    {
      approve: true,
      notes: "Approved and verified.",
    },
  );
  assert.equal(decideRes.status, 200);
  assert.equal(decideRes.body.ok, true);
  assert.equal(decideRes.body.evidenceDeleted, true);

  // 4. Evidence files are now gone from disk and return 404
  const afterApplicantView = await applicant.client.get(
    `/api/app/files/identity-evidence/${idDoc.body.path}`,
  );
  assert.equal(afterApplicantView.status, 404);

  const afterReviewerView = await reviewer.client.get(
    `/api/app/files/identity-evidence/${idDoc.body.path}`,
  );
  assert.equal(afterReviewerView.status, 404);

  // Confirm folder does not exist on disk
  const idFilename = idDoc.body.path.split("/")[1];
  assert.equal(
    resolveFilePath({
      kind: "identity-evidence",
      parts: [applicant.id, idFilename],
      env,
    }),
    null,
  );
});

test("REQ-009: missing file on disk returns 404 honestly", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-missing-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const reporter = await createSignedInUser(server, { role: "resident" });
  const reportId = randomUUID();

  // Upload photo
  const uploadRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(uploadRes.status, 200);
  const photoPath = uploadRes.body.path;

  // View photo succeeds
  const view1 = await reporter.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(view1.status, 200);

  // Delete the file from disk directly
  const [repId, rptId, filename] = photoPath.split("/");
  const diskPath = resolveFilePath({
    kind: "report-photos",
    parts: [repId, rptId, filename],
    env,
  });
  assert.ok(diskPath);
  rmSync(diskPath, { force: true });

  // View photo now returns 404!
  const view2 = await reporter.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(view2.status, 404);
});

test("REQ-009: applicants and responders cannot delete files", async (t) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "tabang-no-delete-"));
  t.after(() => rmSync(uploadDir, { recursive: true, force: true }));

  const store = createPostgresStore();
  const env = { APP_ORIGIN: "http://example.test", UPLOAD_DIR: uploadDir };
  const server = await startTestServer(t, {}, { store, env });

  const reporter = await createSignedInUser(server, { role: "resident" });
  const responder = await createSignedInUser(server, { role: "responder" });
  const reportId = randomUUID();

  const uploadRes = await reporter.client.post(
    `/api/app/files/report-photos/${reportId}`,
    PNG_BYTES,
    { headers: { "content-type": "image/png" } },
  );
  assert.equal(uploadRes.status, 200);
  const photoPath = uploadRes.body.path;

  // Reporter cannot delete via HTTP DELETE
  const repDelete = await reporter.client.delete(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(repDelete.status, 405);

  // Responder cannot delete via HTTP DELETE
  const respDelete = await responder.client.delete(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(respDelete.status, 405);

  // File is still intact
  const view = await reporter.client.get(`/api/app/files/report-photos/${photoPath}`);
  assert.equal(view.status, 200);
});
