import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { anonymousClient, assertDenied, assertOk, createUser } from "./helpers/clients.mjs";
import { PNG_BYTES } from "./helpers/files.mjs";

const PHOTOS = "report-photos";
const EVIDENCE = "identity-evidence";

async function upload(user, bucket, path, body = PNG_BYTES, contentType = "image/png") {
  return user.client.storage.from(bucket).upload(path, body, { contentType });
}

async function canView(client, bucket, path) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);

  if (error) {
    return false;
  }

  const response = await fetch(data.signedUrl);

  return response.status === 200;
}

test("REQ-042: report photos are private to the reporter and responders", async () => {
  const reporter = await createUser();
  const stranger = await createUser();
  const responder = await createUser("responder");
  const path = `${reporter.id}/${randomUUID()}/photo.png`;

  assertOk(await upload(reporter, PHOTOS, path));

  assert.equal(await canView(reporter.client, PHOTOS, path), true);
  assert.equal(await canView(responder.client, PHOTOS, path), true);
  assert.equal(await canView(stranger.client, PHOTOS, path), false);
  assert.equal(await canView(anonymousClient(), PHOTOS, path), false);

  const publicUrl = anonymousClient().storage.from(PHOTOS).getPublicUrl(path).data.publicUrl;
  assert.notEqual((await fetch(publicUrl)).status, 200, "the bucket is not public");
});

test("REQ-042: evidence is private to the applicant and reviewers", async () => {
  const applicant = await createUser();
  const stranger = await createUser();
  const responder = await createUser("responder");
  const reviewer = await createUser("reviewer");
  const path = `${applicant.id}/id-${randomUUID()}.png`;

  assertOk(await upload(applicant, EVIDENCE, path));

  assert.equal(await canView(applicant.client, EVIDENCE, path), true);
  assert.equal(await canView(reviewer.client, EVIDENCE, path), true);
  assert.equal(await canView(responder.client, EVIDENCE, path), false);
  assert.equal(await canView(stranger.client, EVIDENCE, path), false);
  assert.equal(await canView(anonymousClient(), EVIDENCE, path), false);
});

test("REQ-042: uploads go only into the caller's own folder", async () => {
  const user = await createUser();
  const other = await createUser();

  assertDenied(await upload(user, PHOTOS, `${other.id}/${randomUUID()}/photo.png`));
  assertDenied(await upload(user, PHOTOS, `${user.id}/photo.png`), {}, "photos need a report folder");
  assertDenied(await upload(user, EVIDENCE, `${other.id}/id.png`));
  assertDenied(
    await anonymousClient().storage.from(PHOTOS).upload(`anon/${randomUUID()}/photo.png`, PNG_BYTES, {
      contentType: "image/png",
    }),
  );
});

test("REQ-042: non-image and oversized files are refused", async () => {
  const user = await createUser();
  const folder = `${user.id}/${randomUUID()}`;

  assertDenied(await upload(user, PHOTOS, `${folder}/notes.txt`, Buffer.from("hello"), "text/plain"));
  assertDenied(
    await upload(user, PHOTOS, `${folder}/huge.png`, Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
  );
  assertDenied(
    await upload(user, EVIDENCE, `${user.id}/doc.pdf`, Buffer.from("%PDF-1.7"), "application/pdf"),
  );
});

test("REQ-042: reviewers delete evidence only after a decision", async () => {
  const applicant = await createUser();
  const reviewer = await createUser("reviewer");
  const identity = `${applicant.id}/id-${randomUUID()}.png`;
  const selfie = `${applicant.id}/selfie-${randomUUID()}.png`;

  assertOk(await upload(applicant, EVIDENCE, identity));
  assertOk(await upload(applicant, EVIDENCE, selfie));
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

  // Storage reports a refused delete as an empty result, not an error.
  const early = assertOk(await reviewer.client.storage.from(EVIDENCE).remove([identity]));
  assert.deepEqual(early, []);
  assert.equal(await canView(reviewer.client, EVIDENCE, identity), true);

  assertOk(
    await reviewer.client.rpc("decide_application", { applicant_id: applicant.id, approve: false }),
  );

  const removed = assertOk(await reviewer.client.storage.from(EVIDENCE).remove([identity, selfie]));
  assert.equal(removed.length, 2);
  assert.equal(await canView(applicant.client, EVIDENCE, identity), false);
});

test("applicants and responders cannot delete files", async () => {
  const reporter = await createUser();
  const responder = await createUser("responder");
  const path = `${reporter.id}/${randomUUID()}/photo.png`;

  assertOk(await upload(reporter, PHOTOS, path));
  assert.deepEqual(assertOk(await reporter.client.storage.from(PHOTOS).remove([path])), []);
  assert.deepEqual(assertOk(await responder.client.storage.from(PHOTOS).remove([path])), []);
  assert.equal(await canView(reporter.client, PHOTOS, path), true);
});
