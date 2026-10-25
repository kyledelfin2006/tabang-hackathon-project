import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  DENIED,
  adminClient,
  anonymousClient,
  assertDenied,
  assertOk,
  createUser,
} from "./helpers/clients.mjs";

async function seedHotline() {
  const id = `test-${randomUUID()}`;
  assertOk(
    await adminClient()
      .from("hotlines")
      .insert({ id, organization: "Test DRRM Office", phone_numbers: ["(036) 262-4979"] }),
  );

  return id;
}

async function directoryRow(id) {
  return assertOk(
    await anonymousClient()
      .from("hotline_directory")
      .select("rating_count, rating_total")
      .eq("id", id)
      .single(),
  );
}

test("REQ-008: rating totals follow the stored reviews", async () => {
  const id = await seedHotline();
  const first = await createUser();
  const second = await createUser();

  assertOk(await first.client.from("hotline_reviews").insert({ hotline_id: id, rating: 4, comment: "" }));
  assertOk(await second.client.from("hotline_reviews").insert({ hotline_id: id, rating: 2 }));
  assert.deepEqual(await directoryRow(id), { rating_count: 2, rating_total: 6 });

  // Replacing a review changes the total, not the count.
  assertOk(
    await first.client
      .from("hotline_reviews")
      .upsert({ hotline_id: id, rating: 5, comment: "Answered quickly." }),
  );
  assert.deepEqual(await directoryRow(id), { rating_count: 2, rating_total: 7 });

  const stored = assertOk(
    await anonymousClient().from("hotline_reviews").select("rating").eq("hotline_id", id),
  );
  assert.equal(stored.reduce((sum, review) => sum + review.rating, 0), 7);
});

test("REQ-008: one review per account per hotline", async () => {
  const id = await seedHotline();
  const user = await createUser();

  assertOk(await user.client.from("hotline_reviews").insert({ hotline_id: id, rating: 3 }));
  assertDenied(await user.client.from("hotline_reviews").insert({ hotline_id: id, rating: 1 }), {
    code: "23505",
  });
});

test("REQ-008: clients cannot forge counts, totals, or another reviewer", async () => {
  const id = await seedHotline();
  const user = await createUser();
  const other = await createUser();

  assertDenied(
    await user.client.from("hotline_directory").update({ rating_count: 99 }).eq("id", id),
  );
  assertDenied(
    await user.client.from("hotline_directory").insert({ id: "x", rating_total: 500 }),
  );
  assertDenied(
    await user.client
      .from("hotline_reviews")
      .insert({ hotline_id: id, rating: 5, reviewer_id: other.id }),
    { code: DENIED },
  );
  assertDenied(
    await user.client.from("hotline_reviews").insert({ hotline_id: id, rating: 9 }),
    { code: "23514" },
  );
  assert.deepEqual(
    assertOk(await user.client.from("hotlines").update({ organization: "Fake" }).eq("id", id).select()),
    [],
    "a non-reviewer's update matches no rows",
  );
  assertDenied(await anonymousClient().from("hotline_reviews").insert({ hotline_id: id, rating: 5 }), {
    code: DENIED,
  });

  assert.deepEqual(await directoryRow(id), { rating_count: 0, rating_total: 0 });
});

test("only reviewers maintain the hotline directory", async () => {
  const resident = await createUser();
  const responder = await createUser("responder");
  const reviewer = await createUser("reviewer");
  const row = { id: `test-${randomUUID()}`, organization: "New office", phone_numbers: ["911"] };

  for (const user of [resident, responder]) {
    assertDenied(await user.client.from("hotlines").insert(row), { code: DENIED });
  }

  assertOk(await reviewer.client.from("hotlines").insert(row));
  assertOk(
    await reviewer.client
      .from("hotlines")
      .update({ verified: true, verified_at: new Date().toISOString(), verified_by: "Reviewer" })
      .eq("id", row.id),
  );
  assertDenied(
    await reviewer.client.from("hotlines").update({ verified_at: null }).eq("id", row.id),
    { code: "23514" },
  );

  const listed = assertOk(
    await anonymousClient().from("hotline_directory").select("verified").eq("id", row.id).single(),
  );
  assert.equal(listed.verified, true);
});