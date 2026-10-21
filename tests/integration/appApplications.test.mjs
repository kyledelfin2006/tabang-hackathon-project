import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { closePool } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { startTestServer } from "../server/testServer.mjs";
import { createSignedInUser } from "./helpers/appClient.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-007: responder application submission, reviewer queue, and decision role upgrade", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const applicant = await createSignedInUser(server, { role: "resident" });
  const reviewer = await createSignedInUser(server, { role: "reviewer" });

  // 1. Validation error: missing consent or evidence -> 400 invalid_request
  const invalidApp = await applicant.client.post("/api/app/applications", {
    values: {
      organization: "Kalibo MDRRMO",
      badgeNumber: "R-100",
      municipality: "Kalibo",
      consentAccepted: false,
    },
    evidence: {},
  });
  assert.equal(invalidApp.status, 400);

  // 2. Submit valid application
  const validApp = await applicant.client.post("/api/app/applications", {
    values: {
      organization: "Kalibo MDRRMO",
      badgeNumber: "R-100",
      municipality: "Kalibo",
      consentAccepted: true,
    },
    evidence: {
      identityDocumentPath: `${applicant.id}/id.png`,
      selfiePath: `${applicant.id}/selfie.png`,
    },
  });
  assert.equal(validApp.status, 200);

  // 3. Applicant checks my application
  const myAppRes = await applicant.client.get("/api/app/applications/mine");
  assert.equal(myAppRes.status, 200);
  assert.equal(myAppRes.body.status, "pending");
  assert.equal(myAppRes.body.organization, "Kalibo MDRRMO");
  assert.equal(myAppRes.body.badgeNumber, "R-100");

  // 4. Repeated submission while pending gets 409 invalid_transition
  const duplicateApp = await applicant.client.post("/api/app/applications", {
    values: {
      organization: "Kalibo MDRRMO",
      badgeNumber: "R-100",
      municipality: "Kalibo",
      consentAccepted: true,
    },
    evidence: {
      identityDocumentPath: `${applicant.id}/id.png`,
      selfiePath: `${applicant.id}/selfie.png`,
    },
  });
  assert.equal(duplicateApp.status, 409);
  assert.equal(duplicateApp.body.error.code, "invalid_transition");

  // 5. Reviewer queue access:
  // - Applicant (resident) cannot view queue -> 403 forbidden
  const forbiddenQueue = await applicant.client.get("/api/app/applications");
  assert.equal(forbiddenQueue.status, 403);

  // - Reviewer views queue
  const queueRes = await reviewer.client.get("/api/app/applications");
  assert.equal(queueRes.status, 200);
  const item = queueRes.body.find((a) => a.applicantId === applicant.id);
  assert.ok(item);
  assert.equal(item.organization, "Kalibo MDRRMO");
  assert.equal(item.applicantEmail, applicant.email);

  // 6. Reviewer decides application (approve)
  const decideRes = await reviewer.client.post(
    `/api/app/applications/${applicant.id}/decision`,
    {
      approve: true,
      notes: "Credentials verified.",
    },
  );
  assert.equal(decideRes.status, 200);

  // 7. Applicant role is upgraded immediately on next session check!
  const sessionRes = await applicant.client.get("/api/app/session");
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.role, "responder");
});
