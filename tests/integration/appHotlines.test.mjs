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

test("REQ-007, REQ-008: hotline directory, review submissions, and view aggregates", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const resident1 = await createSignedInUser(server, { role: "resident" });
  const resident2 = await createSignedInUser(server, { role: "resident" });
  const anon = createApiClient(server);

  const hotlineId = `hotline-${randomUUID()}`;
  await query(
    `insert into public.hotlines (id, organization, coverage_area, phone_numbers)
     values ($1, $2, $3, $4)`,
    [hotlineId, "Aklan Red Cross Test", "Province-wide", ["09171112222"]],
  );

  // 1. Anonymous visitor can read hotlines
  const initialRes = await anon.get("/api/app/hotlines");
  assert.equal(initialRes.status, 200);
  const initialItem = initialRes.body.find((h) => h.id === hotlineId);
  assert.ok(initialItem);
  assert.equal(initialItem.ratingCount, 0);
  assert.equal(initialItem.ratingTotal, 0);

  // 2. First resident reviews (rating 4)
  const rev1 = await resident1.client.put(`/api/app/hotlines/${hotlineId}/review`, {
    rating: 4,
    comment: "Fast response.",
  });
  assert.equal(rev1.status, 200);

  // 3. Second resident reviews (rating 2)
  const rev2 = await resident2.client.put(`/api/app/hotlines/${hotlineId}/review`, {
    rating: 2,
    comment: "Line was busy.",
  });
  assert.equal(rev2.status, 200);

  // 4. Directory view reflects totals (count: 2, total: 6, average: 3.0)
  const afterReviews = await anon.get("/api/app/hotlines");
  const ratedItem = afterReviews.body.find((h) => h.id === hotlineId);
  assert.equal(ratedItem.ratingCount, 2);
  assert.equal(ratedItem.ratingTotal, 6);
  assert.equal(ratedItem.averageRating, 3.0);

  // 5. First resident updates their review (rating 5)
  const rev1Update = await resident1.client.put(`/api/app/hotlines/${hotlineId}/review`, {
    rating: 5,
    comment: "Updated: Excellent follow-up.",
  });
  assert.equal(rev1Update.status, 200);

  // Directory view updates total without duplicating count (count: 2, total: 7, average: 3.5)
  const afterUpdate = await anon.get("/api/app/hotlines");
  const updatedItem = afterUpdate.body.find((h) => h.id === hotlineId);
  assert.equal(updatedItem.ratingCount, 2);
  assert.equal(updatedItem.ratingTotal, 7);
  assert.equal(updatedItem.averageRating, 3.5);

  // 6. Resident retrieves their own review
  const myReviewRes = await resident1.client.get(`/api/app/hotlines/${hotlineId}/review`);
  assert.equal(myReviewRes.status, 200);
  assert.equal(myReviewRes.body.rating, 5);
  assert.equal(myReviewRes.body.comment, "Updated: Excellent follow-up.");

  // 7. Validation: invalid rating (0 or 6) gets 400
  const invalidRating = await resident1.client.put(`/api/app/hotlines/${hotlineId}/review`, {
    rating: 6,
  });
  assert.equal(invalidRating.status, 400);

  // 8. Anonymous cannot review -> 401
  const anonReview = await anon.put(`/api/app/hotlines/${hotlineId}/review`, {
    rating: 5,
  });
  assert.equal(anonReview.status, 401);
});
