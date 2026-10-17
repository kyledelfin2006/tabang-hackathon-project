import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  DENIED,
  FUNCTION_ERROR,
  PASSWORD,
  adminClient,
  anonymousClient,
  assertDenied,
  assertOk,
  createUser,
} from "./helpers/clients.mjs";

test("sign-up creates a normalized profile and a resident", async () => {
  const user = await createUser("resident", {
    display_name: "  Maria   Santos ",
    phone: "+63 917 123 4567",
    barangay: " Andagao ",
  });

  const profile = assertOk(
    await user.client.from("profiles").select("*").eq("id", user.id).single(),
  );

  assert.equal(profile.display_name, "Maria Santos");
  assert.equal(profile.phone, "09171234567");
  assert.equal(profile.barangay, "Andagao");
  assert.equal(profile.email, user.email);

  const roles = assertOk(await user.client.from("role_assignments").select("*"));
  assert.deepEqual(roles, [], "no row means resident");
});

test("sign-up with invalid profile details is refused", async () => {
  const result = await anonymousClient().auth.signUp({
    email: `bad-${randomUUID()}@tabang.test`,
    password: PASSWORD,
    options: { data: { display_name: "", phone: "12345", barangay: "Poblacion" } },
  });

  assert.ok(result.error, "the trigger's constraints must fail the sign-up");
});

test("owners edit name, phone, and barangay but not email", async () => {
  const user = await createUser();

  assertOk(
    await user.client
      .from("profiles")
      .update({ display_name: "New Name", phone: "09998887777", barangay: "Estancia" })
      .eq("id", user.id),
  );
  assertDenied(
    await user.client.from("profiles").update({ email: "x@tabang.test" }).eq("id", user.id),
    { code: DENIED },
  );
  assertDenied(
    await user.client.from("profiles").update({ phone: "not-a-phone" }).eq("id", user.id),
  );

  const profile = assertOk(
    await user.client.from("profiles").select("display_name, phone, barangay").eq("id", user.id).single(),
  );
  assert.deepEqual(profile, { display_name: "New Name", phone: "09998887777", barangay: "Estancia" });
});

test("profiles are visible to their owner and reviewers only", async () => {
  const owner = await createUser();
  const other = await createUser();
  const reviewer = await createUser("reviewer");

  assert.deepEqual(
    assertOk(await other.client.from("profiles").select("id").eq("id", owner.id)),
    [],
  );
  assert.equal(
    assertOk(await reviewer.client.from("profiles").select("id").eq("id", owner.id)).length,
    1,
  );
  assertDenied(await anonymousClient().from("profiles").select("id"), { code: DENIED });
});

test("REQ-006: no client writes role_assignments directly", async () => {
  const resident = await createUser();
  const reviewer = await createUser("reviewer");
  const admin = await createUser("admin");

  for (const actor of [resident, reviewer, admin]) {
    assertDenied(
      await actor.client.from("role_assignments").insert({ user_id: actor.id, role: "admin" }),
      { code: DENIED },
    );
    assertDenied(
      await actor.client.from("role_assignments").update({ role: "admin" }).eq("user_id", actor.id),
      { code: DENIED },
    );
  }
});

test("REQ-006: reviewers grant only resident or responder, never to themselves", async () => {
  const reviewer = await createUser("reviewer");
  const target = await createUser();
  const otherReviewer = await createUser("reviewer");

  assertOk(await reviewer.client.rpc("set_role", { user_id: target.id, role: "responder" }));
  assert.equal(
    assertOk(await target.client.from("role_assignments").select("role").single()).role,
    "responder",
  );
  assertOk(await reviewer.client.rpc("set_role", { user_id: target.id, role: "resident" }));

  for (const role of ["reviewer", "admin"]) {
    assertDenied(await reviewer.client.rpc("set_role", { user_id: target.id, role }), {
      code: FUNCTION_ERROR,
      message: /forbidden/,
    });
  }

  assertDenied(await reviewer.client.rpc("set_role", { user_id: reviewer.id, role: "responder" }), {
    message: /forbidden/,
  });
  assertDenied(
    await reviewer.client.rpc("set_role", { user_id: otherReviewer.id, role: "resident" }),
    { message: /forbidden/ },
  );
});

test("REQ-006: only an admin grants reviewer or admin", async () => {
  const admin = await createUser("admin");
  const target = await createUser();
  const resident = await createUser();

  assertOk(await admin.client.rpc("set_role", { user_id: target.id, role: "reviewer" }));
  assertOk(await admin.client.rpc("set_role", { user_id: target.id, role: "admin" }));
  assertDenied(await admin.client.rpc("set_role", { user_id: admin.id, role: "resident" }), {
    message: /forbidden/,
  });
  assertDenied(await resident.client.rpc("set_role", { user_id: target.id, role: "responder" }), {
    message: /forbidden/,
  });
  assertDenied(
    await anonymousClient().rpc("set_role", { user_id: target.id, role: "responder" }),
  );

  const stored = assertOk(
    await adminClient().from("role_assignments").select("role").eq("user_id", target.id).single(),
  );
  assert.equal(stored.role, "admin");
});

test("REQ-007: legacy collections do not exist", async () => {
  const resident = await createUser();

  for (const table of ["floodReports", "helpRequests", "responders", "users", "roleAssignments"]) {
    for (const client of [anonymousClient(), resident.client]) {
      assertDenied(await client.from(table).select("*").limit(1));
      assertDenied(await client.from(table).insert({}));
    }
  }
});
