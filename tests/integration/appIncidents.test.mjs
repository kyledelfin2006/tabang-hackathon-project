import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { startTestServer } from "../server/testServer.mjs";
import { createApiClient, createSignedInUser } from "./helpers/appClient.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-007: incident queue, counts, claims, transitions, events, and privacy", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident = await createSignedInUser(server, { role: "resident" });
  const otherResident = await createSignedInUser(server, { role: "resident" });
  const responder1 = await createSignedInUser(server, { role: "responder" });
  const responder2 = await createSignedInUser(server, { role: "responder" });

  const reportId = randomUUID();
  await resident.client.post("/api/app/reports", {
    id: reportId,
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      landmark: "Near bridge",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Severe flooding across road.",
      contactPhone: "09171234567",
      severity: "waist",
    },
  });

  // 1. Authorization: resident gets 403 on responder routes
  const residentQueue = await resident.client.get("/api/app/incidents");
  assert.equal(residentQueue.status, 403);

  const residentCounts = await resident.client.get("/api/app/incidents/counts");
  assert.equal(residentCounts.status, 403);

  // 2. Incident privacy:
  // - Reporter can view their own incident
  const reporterView = await resident.client.get(`/api/app/incidents/${reportId}`);
  assert.equal(reporterView.status, 200);
  assert.equal(reporterView.body.id, reportId);

  // - Unrelated resident gets 404 (does not reveal existence)
  const otherView = await otherResident.client.get(`/api/app/incidents/${reportId}`);
  assert.equal(otherView.status, 404);

  // - Anonymous visitor gets 401
  const anon = createApiClient(server);
  const anonView = await anon.get(`/api/app/incidents/${reportId}`);
  assert.equal(anonView.status, 401);

  // 3. Responder views queue and counts
  const queueRes = await responder1.client.get("/api/app/incidents");
  assert.equal(queueRes.status, 200);
  const incident = queueRes.body.incidents.find((i) => i.id === reportId);
  assert.ok(incident);
  assert.equal(incident.incidentStatus, "new");
  assert.equal(incident.severity, "waist");

  const countsRes = await responder1.client.get("/api/app/incidents/counts");
  assert.equal(countsRes.status, 200);
  assert.ok(countsRes.body.openIncidents >= 1);
  assert.ok(countsRes.body.unclaimed >= 1);

  // 4. Claiming:
  // - Responder1 claims
  const claim1 = await responder1.client.post(`/api/app/incidents/${reportId}/claim`);
  assert.equal(claim1.status, 200);

  // - Repeated claim by responder1 is idempotent 200
  const claimRepeat = await responder1.client.post(`/api/app/incidents/${reportId}/claim`);
  assert.equal(claimRepeat.status, 200);

  // - Responder2 claiming gets 409 already_claimed
  const claim2 = await responder2.client.post(`/api/app/incidents/${reportId}/claim`);
  assert.equal(claim2.status, 409);
  assert.equal(claim2.body.error.code, "already_claimed");

  // 5. Verification:
  // - Responder1 verifies incident
  const verifyRes = await responder1.client.post(`/api/app/incidents/${reportId}/verify`, {
    verificationStatus: "verified",
  });
  assert.equal(verifyRes.status, 200);

  // 6. Transitioning:
  // - Responder2 (not assigned) cannot transition -> 403 forbidden
  const forbiddenTrans = await responder2.client.post(`/api/app/incidents/${reportId}/transition`, {
    toStatus: "dispatched",
  });
  assert.equal(forbiddenTrans.status, 403);

  // - Responder1 advances through dispatched -> on_scene -> resolved
  for (const status of ["dispatched", "on_scene", "resolved"]) {
    const stepRes = await responder1.client.post(`/api/app/incidents/${reportId}/transition`, {
      toStatus: status,
      note: `Moved to ${status}`,
    });
    assert.equal(stepRes.status, 200);
  }

  // - Invalid transition (resolved -> dispatched) gets 409 invalid_transition
  const invalidTrans = await responder1.client.post(`/api/app/incidents/${reportId}/transition`, {
    toStatus: "dispatched",
  });
  assert.equal(invalidTrans.status, 409);
  assert.equal(invalidTrans.body.error.code, "invalid_transition");

  // 7. Audit trail:
  const eventsRes = await responder1.client.get(`/api/app/incidents/${reportId}/events`);
  assert.equal(eventsRes.status, 200);
  assert.ok(eventsRes.body.length >= 5); // claim, verify, dispatched, on_scene, resolved
  const statusChanges = eventsRes.body.filter((e) => e.type === "status-change");
  assert.ok(statusChanges.some((e) => e.toStatus === "acknowledged"));
  assert.ok(statusChanges.some((e) => e.toStatus === "dispatched"));
  assert.ok(statusChanges.some((e) => e.toStatus === "on_scene"));
  assert.ok(statusChanges.some((e) => e.toStatus === "resolved"));
});
