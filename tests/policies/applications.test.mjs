import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  DENIED,
  anonymousClient,
  assertDenied,
  assertOk,
  createUser,
} from "./helpers/clients.mjs";
import { PNG_BYTES } from "./helpers/files.mjs";

const EVIDENCE = "identity-evidence";

async function apply(applicant) {
  const identity = `${applicant.id}/id-${randomUUID()}.png`;
  const selfie = `${applicant.id}/selfie-${randomUUID()}.png`;

  for (const path of [identity, selfie]) {
    assertOk(
      await applicant.client.storage
        .from(EVIDENCE)
        .upload(path, PNG_BYTES, { contentType: "image/png" }),
    );
  }

  assertOk(
    await applicant.client.rpc("submit_application", {
      organization: "Kalibo MDRRMO",
      badge_number: "R-1024",
      municipality: "Kalibo",
      identity_document_path: identity,
      selfie_path: selfie,
      consent_version: "2026-04-privacy-and-terms",
    }),
  );

  return { identity, selfie };
}

async function statusOf(applicant) {
  return assertOk(
    await applicant.client.from("responder_applications").select("*").single(),
  );
}

test("applications are created and decided only through functions", async () => {
  const applicant = await createUser();
  const other = await createUser();
  const reviewer = await createUser("reviewer");

  assertDenied(
    await applicant.client.from("responder_applications").insert({
      applicant_id: applicant.id,
      organization: "Kalibo MDRRMO",
      badge_number: "R-1",
      municipality: "Kalibo",
      consent_version: "x",
      status: "approved",
    }),
    { code: DENIED },
  );

  await apply(applicant);

  assertDenied(
    await applicant.client
      .from("responder_applications")
      .update({ status: "approved" })
      .eq("applicant_id", applicant.id),
    { code: DENIED },
  );
  assertDenied(
    await applicant.client.rpc("submit_application", {
      organization: "Kalibo MDRRMO",
      badge_number: "R-1024",
      municipality: "Kalibo",
      identity_document_path: `${applicant.id}/id.png`,
      selfie_path: `${applicant.id}/selfie.png`,
      consent_version: "2026-04-privacy-and-terms",
    }),
    { message: /invalid_transition/ },
  );

  assert.deepEqual(
    assertOk(await other.client.from("responder_applications").select("applicant_id")),
    [],
  );
  assert.equal(
    assertOk(
      await reviewer.client
        .from("responder_applications")
        .select("applicant_id")
        .eq("applicant_id", applicant.id),
    ).length,
    1,
  );
  assertDenied(
    await other.client.rpc("decide_application", { applicant_id: applicant.id, approve: true }),
    { message: /forbidden/ },
  );
});

test("evidence must sit in the applicant's own folder", async () => {
  const applicant = await createUser();
  const other = await createUser();

  assertDenied(
    await applicant.client.rpc("submit_application", {
      organization: "Kalibo MDRRMO",
      badge_number: "R-1024",
      municipality: "Kalibo",
      identity_document_path: `${other.id}/id.png`,
      selfie_path: `${applicant.id}/selfie.png`,
      consent_version: "2026-04-privacy-and-terms",
    }),
    { code: "23514" },
  );
});

test("REQ-027: a rejected applicant can apply again, and approval grants responder", async () => {
  const applicant = await createUser();
  const reviewer = await createUser("reviewer");

  await apply(applicant);
  assertOk(
    await reviewer.client.rpc("decide_application", {
      applicant_id: applicant.id,
      approve: false,
      notes: "The ID photo is unreadable.",
    }),
  );

  const rejected = await statusOf(applicant);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.review_notes, "The ID photo is unreadable.");
  assert.equal(rejected.reviewed_by, reviewer.id);
  assert.equal(rejected.identity_document_path, null);
  assert.equal(rejected.selfie_path, null);

  await apply(applicant);
  assert.equal((await statusOf(applicant)).status, "pending");

  assertOk(
    await reviewer.client.rpc("decide_application", { applicant_id: applicant.id, approve: true }),
  );
  assert.equal((await statusOf(applicant)).status, "approved");

  const role = assertOk(await applicant.client.from("role_assignments").select("role").single());
  assert.equal(role.role, "responder");

  assertDenied(
    await reviewer.client.rpc("decide_application", { applicant_id: applicant.id, approve: false }),
    { message: /invalid_transition/ },
  );
});

test("reviewers never decide their own application", async () => {
  const reviewer = await createUser("reviewer");

  await apply(reviewer);
  assertDenied(
    await reviewer.client.rpc("decide_application", { applicant_id: reviewer.id, approve: true }),
    { message: /forbidden/ },
  );
  assertDenied(
    await anonymousClient().rpc("decide_application", { applicant_id: reviewer.id, approve: true }),
  );
});
