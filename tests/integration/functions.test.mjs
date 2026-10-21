import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool, query } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createUser, fileReport } from "./helpers/db.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-022: a responder claims a resident's report and advances it", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  // Claim incident
  await query("select public.claim_incident($1, $2)", [responder.id, id]);
  // Repeated claim is a no-op
  await query("select public.claim_incident($1, $2)", [responder.id, id]);

  for (const to_status of ["dispatched", "on_scene", "resolved"]) {
    await query("select public.transition_incident($1, $2, $3, $4)", [
      responder.id,
      id,
      to_status,
      `Now ${to_status}`,
    ]);
  }

  const { rows } = await query("select * from public.reports where id = $1", [id]);
  const report = rows[0];
  assert.equal(report.incident_status, "resolved");
  assert.deepEqual(report.assigned_responder_ids, [responder.id]);
  assert.ok(report.acknowledged_at && report.resolved_at);

  await assert.rejects(
    async () => {
      await query("select public.transition_incident($1, $2, $3)", [
        responder.id,
        id,
        "dispatched",
      ]);
    },
    (err) => err.message.includes("invalid_transition"),
  );

  const { rows: events } = await query(
    "select from_status, to_status, actor_id, actor_role from public.report_events where report_id = $1 order by id",
    [id],
  );
  assert.deepEqual(
    events.map((e) => `${e.from_status}>${e.to_status}`),
    ["new>acknowledged", "acknowledged>dispatched", "dispatched>on_scene", "on_scene>resolved"],
  );
  assert.ok(
    events.every((e) => e.actor_id === responder.id && e.actor_role === "responder"),
  );
});

test("acknowledging a new incident claims it", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  await query("select public.transition_incident($1, $2, $3)", [
    responder.id,
    id,
    "acknowledged",
  ]);

  const { rows } = await query(
    "select assigned_responder_ids, incident_status from public.reports where id = $1",
    [id],
  );
  assert.deepEqual(rows[0], {
    assigned_responder_ids: [responder.id],
    incident_status: "acknowledged",
  });
});

test("claims and changes are refused for the wrong caller", async () => {
  const resident = await createUser();
  const first = await createUser("responder");
  const second = await createUser("responder");
  const reviewer = await createUser("reviewer");
  const id = await fileReport(resident);

  // Resident cannot claim
  await assert.rejects(
    async () => query("select public.claim_incident($1, $2)", [resident.id, id]),
    (err) => err.message.includes("forbidden"),
  );

  // Non-existent report cannot be claimed
  await assert.rejects(
    async () => query("select public.claim_incident($1, $2)", [first.id, randomUUID()]),
    (err) => err.message.includes("not_found"),
  );

  // First responder claims
  await query("select public.claim_incident($1, $2)", [first.id, id]);

  // Second responder cannot claim already claimed
  await assert.rejects(
    async () => query("select public.claim_incident($1, $2)", [second.id, id]),
    (err) => err.message.includes("already_claimed"),
  );

  // Second responder cannot transition
  await assert.rejects(
    async () =>
      query("select public.transition_incident($1, $2, $3)", [
        second.id,
        id,
        "dispatched",
      ]),
    (err) => err.message.includes("forbidden"),
  );

  // Second responder cannot verify
  await assert.rejects(
    async () =>
      query("select public.verify_incident($1, $2, $3)", [second.id, id, "verified"]),
    (err) => err.message.includes("forbidden"),
  );

  // Reviewers may act on any incident
  await query("select public.transition_incident($1, $2, $3)", [
    reviewer.id,
    id,
    "dispatched",
  ]);
});

test("REQ-019: responders verify or reject, and the event is recorded", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const id = await fileReport(resident);

  await query("select public.claim_incident($1, $2)", [responder.id, id]);

  await assert.rejects(
    async () =>
      query("select public.verify_incident($1, $2, $3)", [responder.id, id, "pending"]),
    (err) => err.message.includes("invalid_request"),
  );

  await query("select public.verify_incident($1, $2, $3)", [responder.id, id, "rejected"]);
  await query("select public.verify_incident($1, $2, $3)", [responder.id, id, "verified"]);

  const { rows } = await query(
    "select verification_status from public.reports where id = $1",
    [id],
  );
  assert.equal(rows[0].verification_status, "verified");

  const { rows: events } = await query(
    "select to_status from public.report_events where report_id = $1 and type = 'verification' order by id",
    [id],
  );
  assert.deepEqual(
    events.map((e) => e.to_status),
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

  await assert.rejects(
    async () => query("select public.cancel_report($1, $2)", [other.id, fresh]),
    (err) => err.message.includes("not_found"),
  );

  await query("select public.cancel_report($1, $2)", [resident.id, fresh]);

  await query("select public.claim_incident($1, $2)", [responder.id, acknowledged]);
  await query("select public.cancel_report($1, $2)", [resident.id, acknowledged]);

  await query("select public.claim_incident($1, $2)", [responder.id, dispatched]);
  await query("select public.transition_incident($1, $2, $3)", [
    responder.id,
    dispatched,
    "dispatched",
  ]);

  await assert.rejects(
    async () => query("select public.cancel_report($1, $2)", [resident.id, dispatched]),
    (err) => err.message.includes("not_cancellable"),
  );

  await assert.rejects(
    async () => query("select public.cancel_report($1, $2)", [resident.id, fresh]),
    (err) => err.message.includes("not_cancellable"),
  );
});

test("incident counts are for responders only", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  await fileReport(resident);

  const { rows } = await query("select * from public.incident_counts($1)", [responder.id]);
  assert.ok(rows.length === 1);
  assert.ok(rows[0].open_incidents >= 1);
  assert.ok(rows[0].counted_at);

  await assert.rejects(
    async () => query("select * from public.incident_counts($1)", [resident.id]),
    (err) => err.message.includes("forbidden"),
  );
});

test("applications submit, decide, and role upgrade", async () => {
  const applicant = await createUser();
  const reviewer = await createUser("reviewer");
  const other = await createUser();

  const identity = `${applicant.id}/id-${randomUUID()}.png`;
  const selfie = `${applicant.id}/selfie-${randomUUID()}.png`;

  // Submit application
  await query(
    `select public.submit_application($1, $2, $3, $4, $5, $6, $7)`,
    [
      applicant.id,
      "Kalibo MDRRMO",
      "R-1024",
      "Kalibo",
      identity,
      selfie,
      "2026-04-privacy-and-terms",
    ],
  );

  // Submitting while pending is rejected
  await assert.rejects(
    async () =>
      query(`select public.submit_application($1, $2, $3, $4, $5, $6, $7)`, [
        applicant.id,
        "Kalibo MDRRMO",
        "R-1024",
        "Kalibo",
        identity,
        selfie,
        "2026-04-privacy-and-terms",
      ]),
    (err) => err.message.includes("invalid_transition"),
  );

  // Non-reviewer deciding is rejected
  await assert.rejects(
    async () =>
      query("select public.decide_application($1, $2, $3, $4)", [
        other.id,
        applicant.id,
        true,
        "notes",
      ]),
    (err) => err.message.includes("forbidden"),
  );

  // Reviewer deciding their own application is rejected
  await assert.rejects(
    async () =>
      query("select public.decide_application($1, $2, $3, $4)", [
        reviewer.id,
        reviewer.id,
        true,
        "notes",
      ]),
    (err) => err.message.includes("forbidden"),
  );

  // Reject application
  await query("select public.decide_application($1, $2, $3, $4)", [
    reviewer.id,
    applicant.id,
    false,
    "ID unreadable",
  ]);

  const { rows: rejectedRows } = await query(
    "select * from public.responder_applications where applicant_id = $1",
    [applicant.id],
  );
  assert.equal(rejectedRows[0].status, "rejected");
  assert.equal(rejectedRows[0].review_notes, "ID unreadable");
  assert.equal(rejectedRows[0].identity_document_path, null);

  // Rejected applicant can apply again
  await query(
    `select public.submit_application($1, $2, $3, $4, $5, $6, $7)`,
    [
      applicant.id,
      "Kalibo MDRRMO",
      "R-1024",
      "Kalibo",
      identity,
      selfie,
      "2026-04-privacy-and-terms",
    ],
  );

  // Approve application
  await query("select public.decide_application($1, $2, $3, $4)", [
    reviewer.id,
    applicant.id,
    true,
    "Looks good",
  ]);

  const { rows: approvedRows } = await query(
    "select * from public.responder_applications where applicant_id = $1",
    [applicant.id],
  );
  assert.equal(approvedRows[0].status, "approved");

  // Role updated to responder
  const { rows: roleRows } = await query(
    "select role from public.role_assignments where user_id = $1",
    [applicant.id],
  );
  assert.equal(roleRows[0].role, "responder");
});

test("REQ-008: hotline directory view calculates ratings correctly", async () => {
  const hotlineId = `hl-${randomUUID().slice(0, 8)}`;
  await query(
    "insert into public.hotlines (id, organization, phone_numbers) values ($1, $2, $3)",
    [hotlineId, "Test Rescue", ["09112233445"]],
  );

  const u1 = await createUser();
  const u2 = await createUser();

  await query(
    "insert into public.hotline_reviews (hotline_id, reviewer_id, rating, comment) values ($1, $2, $3, $4)",
    [hotlineId, u1.id, 4, "Good"],
  );
  await query(
    "insert into public.hotline_reviews (hotline_id, reviewer_id, rating, comment) values ($1, $2, $3, $4)",
    [hotlineId, u2.id, 2, "Slow"],
  );

  const { rows } = await query(
    "select rating_count, rating_total from public.hotline_directory where id = $1",
    [hotlineId],
  );
  assert.deepEqual(rows[0], { rating_count: 2, rating_total: 6 });

  // Update review replaces rating
  await query(
    "update public.hotline_reviews set rating = 5 where hotline_id = $1 and reviewer_id = $2",
    [hotlineId, u1.id],
  );

  const { rows: updatedRows } = await query(
    "select rating_count, rating_total from public.hotline_directory where id = $1",
    [hotlineId],
  );
  assert.deepEqual(updatedRows[0], { rating_count: 2, rating_total: 7 });
});
