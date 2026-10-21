import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool, query } from "../../server/db.mjs";
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

test("REQ-007: resident files flood and help reports, verified on database and personal feed", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident = await createSignedInUser(server, { role: "resident" });
  const otherResident = await createSignedInUser(server, { role: "resident" });

  const floodId = randomUUID();
  const helpId = randomUUID();

  // 1. File flood report
  const floodRes = await resident.client.post("/api/app/reports", {
    id: floodId,
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      landmark: "Near church",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Flood water reached knee level on Main Street.",
      contactPhone: "09171234567",
      latitude: 11.7,
      longitude: 122.36,
      severity: "knee",
    },
  });
  assert.equal(floodRes.status, 200);
  assert.equal(floodRes.body.reportId, floodId);

  // 2. File help report
  const helpRes = await resident.client.post("/api/app/reports", {
    id: helpId,
    values: {
      kind: "help",
      municipality: "Kalibo",
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Family needs evacuation assistance urgently.",
      contactPhone: "09171234567",
      need: "rescue",
      peopleAffected: 4,
    },
  });
  assert.equal(helpRes.status, 200);

  // 3. Verify in database: client cannot choose priority, status, assignment, or reporter
  const { rows } = await query(
    `select id, reporter_id, priority, incident_status, verification_status, assigned_responder_ids
     from public.reports where id in ($1, $2)`,
    [floodId, helpId],
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.reporter_id, resident.id);
    assert.equal(row.priority, "medium");
    assert.equal(row.incident_status, "new");
    assert.equal(row.verification_status, "pending");
    assert.deepEqual(row.assigned_responder_ids, []);
  }

  // 4. Resident checks /api/app/reports/mine
  const myReportsRes = await resident.client.get("/api/app/reports/mine");
  assert.equal(myReportsRes.status, 200);
  assert.equal(myReportsRes.body.reports.length, 2);
  const foundFlood = myReportsRes.body.reports.find((r) => r.id === floodId);
  assert.ok(foundFlood);
  assert.equal(foundFlood.kind, "flood");
  assert.equal(foundFlood.severity, "knee");
  assert.equal(foundFlood.landmark, "Near church");
  assert.equal(foundFlood.canCancel, true);
  assert.equal(foundFlood.isCancelled, false);

  // 5. Other resident checks /api/app/reports/mine -> sees 0 reports (isolated by session)
  const otherReportsRes = await otherResident.client.get("/api/app/reports/mine");
  assert.equal(otherReportsRes.status, 200);
  assert.equal(otherReportsRes.body.reports.length, 0);

  // 6. Anonymous visitor gets 401 unauthorized
  const anonClient = createApiClient(server);
  const anonRes = await anonClient.get("/api/app/reports/mine");
  assert.equal(anonRes.status, 401);
});

test("REQ-007: reports schema constraints are enforced through API", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident = await createSignedInUser(server, { role: "resident" });

  // Missing municipality
  const res1 = await resident.client.post("/api/app/reports", {
    id: randomUUID(),
    values: {
      kind: "flood",
      municipality: null,
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion",
      description: "Valid description here.",
      contactPhone: "09171234567",
      severity: "ankle",
    },
  });
  assert.equal(res1.status, 400);

  // Non-Aklan municipality
  const res2 = await resident.client.post("/api/app/reports", {
    id: randomUUID(),
    values: {
      kind: "flood",
      municipality: "Quezon City",
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion",
      description: "Valid description here.",
      contactPhone: "09171234567",
      severity: "ankle",
    },
  });
  assert.equal(res2.status, 400);

  // Description too short (< 6 chars)
  const res3 = await resident.client.post("/api/app/reports", {
    id: randomUUID(),
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion",
      description: "short",
      contactPhone: "09171234567",
      severity: "ankle",
    },
  });
  assert.equal(res3.status, 400);
});

test("REQ-007: report cancellation lifecycle and authorization", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident = await createSignedInUser(server, { role: "resident" });
  const otherResident = await createSignedInUser(server, { role: "resident" });
  const responder = await createSignedInUser(server, { role: "responder" });

  const reportId = randomUUID();
  await resident.client.post("/api/app/reports", {
    id: reportId,
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Rising flood water on street.",
      contactPhone: "09171234567",
      severity: "ankle",
    },
  });

  // Another resident cannot cancel it (returns 404 so existence is not revealed)
  const otherCancelRes = await otherResident.client.post(`/api/app/reports/${reportId}/cancel`);
  assert.equal(otherCancelRes.status, 404);

  // Reporter cancels their own report -> 200 ok
  const cancelRes = await resident.client.post(`/api/app/reports/${reportId}/cancel`);
  assert.equal(cancelRes.status, 200);

  // Check personal reports feed: shows isCancelled: true, canCancel: false
  const feedRes = await resident.client.get("/api/app/reports/mine");
  const report = feedRes.body.reports.find((r) => r.id === reportId);
  assert.equal(report.isCancelled, true);
  assert.equal(report.canCancel, false);
  assert.equal(report.incidentStatus, "cancelled");

  // A dispatched report cannot be cancelled
  const reportId2 = randomUUID();
  await resident.client.post("/api/app/reports", {
    id: reportId2,
    values: {
      kind: "flood",
      municipality: "Kalibo",
      barangay: "Poblacion",
      publicLocationLabel: "Poblacion, Kalibo",
      description: "Severe flooding everywhere.",
      contactPhone: "09171234567",
      severity: "waist",
    },
  });

  // Responder claims and transitions to dispatched
  await responder.client.post(`/api/app/incidents/${reportId2}/claim`);
  await responder.client.post(`/api/app/incidents/${reportId2}/transition`, {
    toStatus: "dispatched",
    note: "En route",
  });

  // Resident attempts to cancel dispatched report -> 409 not_cancellable
  const cancelDispatchedRes = await resident.client.post(`/api/app/reports/${reportId2}/cancel`);
  assert.equal(cancelDispatchedRes.status, 409);
  assert.equal(cancelDispatchedRes.body.error.code, "not_cancellable");
});
