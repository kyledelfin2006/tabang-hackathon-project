import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./env.mjs";

const env = loadLocalEnv();
const OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export const PASSWORD = "correct-horse-battery";

/**
 * The secret-key client, for test setup only: creating accounts, granting the
 * role a test needs, and seeding rows. Never use it to check what a user is
 * supposed to be denied, because it bypasses every policy.
 */
export function adminClient() {
  if (!env.secretKey) {
    throw new Error("Set SUPABASE_SECRET_KEY from `npx supabase status`.");
  }

  return createClient(env.url, env.secretKey, OPTIONS);
}

export function anonymousClient() {
  return createClient(env.url, env.publishableKey, OPTIONS);
}

/**
 * Creates a confirmed account through the sign-up trigger, grants `role`, and
 * returns a client signed in as that user with the publishable key.
 */
export async function createUser(role = "resident", metadata = {}) {
  const admin = adminClient();
  const email = `${role}-${randomUUID()}@tabang.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: `Test ${role}`,
      phone: "09171234567",
      barangay: "Poblacion",
      ...metadata,
    },
  });

  assert.ifError(error);

  const id = data.user.id;

  if (role !== "resident") {
    const grant = await admin.from("role_assignments").insert({ user_id: id, role });
    assert.ifError(grant.error);
  }

  const client = anonymousClient();
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.ifError(signIn.error);

  return { id, email, client };
}

/** Asserts that a Supabase call failed, optionally with a code or message. */
export function assertDenied(result, { code, message } = {}) {
  assert.ok(result.error, `expected an error, got data ${JSON.stringify(result.data)}`);

  if (code) {
    assert.equal(result.error.code, code, result.error.message);
  }

  if (message) {
    assert.match(result.error.message, message);
  }
}

/** Asserts a call succeeded and returns its data. */
export function assertOk(result) {
  assert.ifError(result.error);

  return result.data;
}

export function floodReport(reporterId, overrides = {}) {
  const id = randomUUID();

  return {
    id,
    kind: "flood",
    municipality: "Kalibo",
    barangay: "Poblacion",
    public_location_label: "Poblacion, Kalibo",
    latitude: 11.7,
    longitude: 122.37,
    description: "Water is knee deep along the main road.",
    contact_phone: "09171234567",
    severity: "knee",
    public_summary: "Flooding reported in Poblacion, Kalibo (knee-deep).",
    image_paths: [],
    ...overrides,
  };
}

/** A resident files a report and a responder-visible id comes back. */
export async function fileReport(resident, overrides = {}) {
  const report = floodReport(resident.id, overrides);
  assertOk(await resident.client.from("reports").insert(report));

  return report.id;
}

// Permission denied, from a missing grant or a failed row-level security check.
export const DENIED = "42501";
export const CHECK_VIOLATION = "23514";
export const FUNCTION_ERROR = "P0001";
