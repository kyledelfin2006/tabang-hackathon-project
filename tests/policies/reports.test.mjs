import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CHECK_VIOLATION,
  DENIED,
  anonymousClient,
  assertDenied,
  assertOk,
  createUser,
  fileReport,
  floodReport,
} from "./helpers/clients.mjs";

test("a resident files a valid flood and help report", async () => {
  const resident = await createUser();

  await fileReport(resident);
  await fileReport(resident, {
    kind: "help",
    severity: null,
    need: "rescue",
    people_affected: 4,
    latitude: null,
    longitude: null,
  });

  const rows = assertOk(
    await resident.client
      .from("reports")
      .select("priority, incident_status, verification_status, reporter_id, assigned_responder_ids"),
  );
  assert.equal(rows.length, 2);

  for (const row of rows) {
    assert.deepEqual(row, {
      priority: "medium",
      incident_status: "new",
      verification_status: "pending",
      reporter_id: resident.id,
      assigned_responder_ids: [],
    });
  }
});

test("REQ-009: report rows are schema-checked", async () => {
  const resident = await createUser();
  const invalid = [
    { kind: "fire" },
    { description: "x".repeat(1001) },
    { description: "short" },
    { public_location_label: "x".repeat(121) },
    { contact_phone: "12345" },
    { latitude: 11.7, longitude: null },
    { latitude: 40, longitude: 122 },
    { severity: null },
    { image_paths: ["someone-else/report/photo.jpg"] },
  ];

  for (const overrides of invalid) {
    assertDenied(
      await resident.client.from("reports").insert(floodReport(resident.id, overrides)),
      { code: CHECK_VIOLATION },
    );
  }
});

test("REQ-009: a client cannot choose priority, status, assignment, or reporter", async () => {
  const resident = await createUser();
  const other = await createUser();
  const chosen = [
    { priority: "high" },
    { incident_status: "resolved" },
    { verification_status: "verified" },
    { assigned_responder_ids: [resident.id] },
    { reporter_id: other.id },
    { created_at: "2020-01-01T00:00:00Z" },
  ];

  for (const overrides of chosen) {
    assertDenied(
      await resident.client.from("reports").insert(floodReport(resident.id, overrides)),
      { code: DENIED },
    );
  }

  const id = await fileReport(resident);

  for (const change of [
    { incident_status: "resolved" },
    { priority: "high" },
    { description: "Changed after filing." },
  ]) {
    assertDenied(await resident.client.from("reports").update(change).eq("id", id), {
      code: DENIED,
    });
  }

  assertDenied(await resident.client.from("reports").delete().eq("id", id), { code: DENIED });
  assertDenied(await anonymousClient().from("reports").insert(floodReport(resident.id)), {
    code: DENIED,
  });
});

test("reports are visible to their reporter and responders only", async () => {
  const resident = await createUser();
  const other = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  assert.deepEqual(assertOk(await other.client.from("reports").select("id").eq("id", id)), []);
  assert.equal(
    assertOk(await responder.client.from("reports").select("id").eq("id", id)).length,
    1,
  );
  assertDenied(await anonymousClient().from("reports").select("id"), { code: DENIED });
});

test("REQ-022: a responder claims a resident's report and advances it", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  assertOk(await responder.client.rpc("claim_incident", { report_id: id }));
  // A repeated claim by the same responder is a no-op, not a second event.
  assertOk(await responder.client.rpc("claim_incident", { report_id: id }));

  for (const to_status of ["dispatched", "on_scene", "resolved"]) {
    assertOk(
      await responder.client.rpc("transition_incident", {
        report_id: id,
        to_status,
        note: `Now ${to_status}`,
      }),
    );
  }

  const report = assertOk(
    await responder.client.from("reports").select("*").eq("id", id).single(),
  );
  assert.equal(report.incident_status, "resolved");
  assert.deepEqual(report.assigned_responder_ids, [responder.id]);
  assert.ok(report.acknowledged_at && report.resolved_at);

  assertDenied(
    await responder.client.rpc("transition_incident", { report_id: id, to_status: "dispatched" }),
    { message: /invalid_transition/ },
  );

  const events = assertOk(
    await resident.client
      .from("report_events")
      .select("from_status, to_status, actor_id, actor_role")
      .eq("report_id", id)
      .order("id"),
  );
  assert.deepEqual(
    events.map((event) => `${event.from_status}>${event.to_status}`),
    ["new>acknowledged", "acknowledged>dispatched", "dispatched>on_scene", "on_scene>resolved"],
  );
  assert.ok(
    events.every((event) => event.actor_id === responder.id && event.actor_role === "responder"),
  );
});

test("acknowledging a new incident claims it", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  assertOk(
    await responder.client.rpc("transition_incident", { report_id: id, to_status: "acknowledged" }),
  );

  const report = assertOk(
    await responder.client
      .from("reports")
      .select("assigned_responder_ids, incident_status")
      .eq("id", id)
      .single(),
  );
  assert.deepEqual(report, { assigned_responder_ids: [responder.id], incident_status: "acknowledged" });
});

test("claims and changes are refused for the wrong caller", async () => {
  const resident = await createUser();
  const first = await createUser("responder");
  const second = await createUser("responder");
  const reviewer = await createUser("reviewer");
  const id = await fileReport(resident);

  assertDenied(await resident.client.rpc("claim_incident", { report_id: id }), {
    message: /forbidden/,
  });
  assertDenied(await anonymousClient().rpc("claim_incident", { report_id: id }));
  assertDenied(await first.client.rpc("claim_incident", { report_id: randomUUID() }), {
    message: /not_found/,
  });

  assertOk(await first.client.rpc("claim_incident", { report_id: id }));
  assertDenied(await second.client.rpc("claim_incident", { report_id: id }), {
    message: /already_claimed/,
  });
  assertDenied(
    await second.client.rpc("transition_incident", { report_id: id, to_status: "dispatched" }),
    { message: /forbidden/ },
  );
  assertDenied(
    await second.client.rpc("verify_incident", { report_id: id, verification_status: "verified" }),
    { message: /forbidden/ },
  );

  // Reviewers may act on any incident.
  assertOk(
    await reviewer.client.rpc("transition_incident", { report_id: id, to_status: "dispatched" }),
  );
});

test("REQ-019: responders verify or reject, and the event is recorded", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  assertOk(await responder.client.rpc("claim_incident", { report_id: id }));
  assertDenied(
    await responder.client.rpc("verify_incident", { report_id: id, verification_status: "pending" }),
    { message: /invalid_request/ },
  );
  assertOk(
    await responder.client.rpc("verify_incident", { report_id: id, verification_status: "rejected" }),
  );
  assertOk(
    await responder.client.rpc("verify_incident", { report_id: id, verification_status: "verified" }),
  );

  const report = assertOk(
    await resident.client.from("reports").select("verification_status").eq("id", id).single(),
  );
  assert.equal(report.verification_status, "verified");

  const events = assertOk(
    await resident.client
      .from("report_events")
      .select("to_status")
      .eq("report_id", id)
      .eq("type", "verification")
      .order("id"),
  );
  assert.deepEqual(
    events.map((event) => event.to_status),
    ["rejected", "verified"],
  );
});

test("REQ-019: reporters cancel only new or acknowledged reports", async () => {
  const resident = await createUser();
  const other = await createUser();
  const responder = await createUser("responder");
  const fresh = await fileReport(resident);
  const acknowledged = await fileReport(resident);
  const dispatched = await fileReport(resident);

  assertDenied(await other.client.rpc("cancel_report", { report_id: fresh }), {
    message: /not_found/,
  });
  assertOk(await resident.client.rpc("cancel_report", { report_id: fresh }));

  assertOk(await responder.client.rpc("claim_incident", { report_id: acknowledged }));
  assertOk(await resident.client.rpc("cancel_report", { report_id: acknowledged }));

  assertOk(await responder.client.rpc("claim_incident", { report_id: dispatched }));
  assertOk(
    await responder.client.rpc("transition_incident", {
      report_id: dispatched,
      to_status: "dispatched",
    }),
  );
  assertDenied(await resident.client.rpc("cancel_report", { report_id: dispatched }), {
    message: /not_cancellable/,
  });
  assertDenied(await resident.client.rpc("cancel_report", { report_id: fresh }), {
    message: /not_cancellable/,
  });

  const statuses = assertOk(
    await resident.client
      .from("reports")
      .select("id, incident_status")
      .in("id", [fresh, acknowledged, dispatched]),
  );
  assert.deepEqual(Object.fromEntries(statuses.map((row) => [row.id, row.incident_status])), {
    [fresh]: "cancelled",
    [acknowledged]: "cancelled",
    [dispatched]: "dispatched",
  });
});

test("audit events are visible to the reporter and responders, never writable", async () => {
  const resident = await createUser();
  const other = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  assertOk(await responder.client.rpc("claim_incident", { report_id: id }));

  assert.equal(
    assertOk(await resident.client.from("report_events").select("id").eq("report_id", id)).length,
    1,
  );
  assert.deepEqual(
    assertOk(await other.client.from("report_events").select("id").eq("report_id", id)),
    [],
  );
  assertDenied(
    await responder.client
      .from("report_events")
      .insert({ report_id: id, type: "status-change", actor_role: "admin" }),
    { code: DENIED },
  );
});

test("incident counts are for responders only", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");

  await fileReport(resident);

  const [counts] = assertOk(await responder.client.rpc("incident_counts"));
  assert.ok(counts.open_incidents >= 1);
  assert.ok(counts.counted_at);
  assertDenied(await resident.client.rpc("incident_counts"), { message: /forbidden/ });
});
