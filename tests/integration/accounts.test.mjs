import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { closePool, query } from "../../server/db.mjs";
import { runMigrations } from "../../server/db/migrate.mjs";
import { createPostgresStore } from "../../server/store.mjs";
import { startTestServer } from "../server/testServer.mjs";
import { createSignInRateLimiter } from "../../server/app/session.mjs";
import { sendPasswordReset } from "../../server/email.mjs";

before(async () => {
  await runMigrations();
});

after(async () => {
  await closePool();
});

test("REQ-003: accounts lifecycle on Postgres (sign-up, profile, sessions, sign-out, hash)", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter: createSignInRateLimiter() },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  const email = `juan-${Date.now()}@example.com`;

  // 1. Invalid profile input is refused with field messages
  const invalidRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password: "short",
      confirmPassword: "short",
      displayName: "",
      phone: "invalid-phone",
      barangay: "",
    }),
  });
  assert.equal(invalidRes.status, 400);
  const invalidBody = JSON.parse(invalidRes.body);
  assert.equal(invalidBody.error.code, "invalid_request");

  // 2. Sign up creates user and profile in Postgres
  const signUpRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password: "SecurePassword123",
      confirmPassword: "SecurePassword123",
      displayName: "Juan Dela Cruz",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  assert.equal(signUpRes.status, 200);
  const signUpBody = JSON.parse(signUpRes.body);
  assert.equal(signUpBody.role, "resident");
  assert.equal(signUpBody.user.email, email);
  assert.equal(signUpBody.profile.displayName, "Juan Dela Cruz");
  assert.equal(signUpBody.profile.phone, "09171234567");
  assert.equal(signUpBody.profile.barangay, "Poblacion");

  // Verify users table holds no plain password
  const { rows: userRows } = await query("select * from public.users where email = $1", [email]);
  assert.equal(userRows.length, 1);
  assert.notEqual(userRows[0].password_hash, "SecurePassword123");
  assert.match(userRows[0].password_hash, /^[0-9a-f]+:[0-9a-f]+$/);

  // Verify profiles table
  const { rows: profileRows } = await query("select * from public.profiles where id = $1", [
    userRows[0].id,
  ]);
  assert.equal(profileRows.length, 1);
  assert.equal(profileRows[0].display_name, "Juan Dela Cruz");
  assert.equal(profileRows[0].phone, "09171234567");
  assert.equal(profileRows[0].barangay, "Poblacion");

  // Verify session cookie format
  const setCookie = signUpRes.headers["set-cookie"];
  assert.ok(setCookie);
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.match(cookieStr, /tabang_session=/);
  assert.match(cookieStr, /HttpOnly/i);
  assert.match(cookieStr, /SameSite=Lax/i);
  assert.match(cookieStr, /Path=\//);

  const cookieMatch = cookieStr.match(/tabang_session=([^;]+)/);
  const sessionCookie = `tabang_session=${cookieMatch[1]}`;

  // 3. GET /api/app/session returns the session data
  const sessionRes = await server.request("/api/app/session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(sessionRes.status, 200);
  const sessionBody = JSON.parse(sessionRes.body);
  assert.equal(sessionBody.role, "resident");
  assert.equal(sessionBody.user.email, email);
  assert.equal(sessionBody.profile.displayName, "Juan Dela Cruz");

  // 4. Unknown email and wrong password get the exact same message
  const unknownEmailRes = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "unknown@example.com", password: "SecurePassword123" }),
  });
  assert.equal(unknownEmailRes.status, 401);
  const unknownErr = JSON.parse(unknownEmailRes.body);

  const wrongPasswordRes = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "WrongPassword999" }),
  });
  assert.equal(wrongPasswordRes.status, 401);
  const wrongErr = JSON.parse(wrongPasswordRes.body);

  assert.equal(unknownErr.error.code, "invalid_credentials");
  assert.equal(wrongErr.error.code, "invalid_credentials");
  assert.equal(unknownErr.error.message, wrongErr.error.message);

  // 5. Sign-in sets Secure cookie when forwarded as https
  const httpsSignInRes = await server.request("/api/app/sign-in", {
    method: "POST",
    headers: {
      ...headers,
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ email, password: "SecurePassword123" }),
  });
  assert.equal(httpsSignInRes.status, 200);
  const httpsCookie = httpsSignInRes.headers["set-cookie"];
  const httpsCookieStr = Array.isArray(httpsCookie) ? httpsCookie[0] : httpsCookie;
  assert.match(httpsCookieStr, /Secure/i);

  // 6. Sign out deletes session from Postgres
  const signOutRes = await server.request("/api/app/sign-out", {
    method: "POST",
    headers: { ...headers, cookie: sessionCookie },
  });
  assert.equal(signOutRes.status, 200);
  const clearCookie = signOutRes.headers["set-cookie"];
  const clearStr = Array.isArray(clearCookie) ? clearCookie[0] : clearCookie;
  assert.match(clearStr, /Max-Age=0/i);

  // Subsequent session check returns null
  const afterSignOut = await server.request("/api/app/session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(afterSignOut.status, 200);
  assert.equal(afterSignOut.body, "null");
});

test("REQ-004: password reset lifecycle, token single-use, session revocation, console logging", async (t) => {
  const store = createPostgresStore();
  let sentEmail = null;
  const loggedLines = [];

  const server = await startTestServer(t, {}, {
    store,
    env: {
      APP_ORIGIN: "http://example.test",
      emailAdapter: ({ to, link }) => {
        sentEmail = { to, link };
      },
      limiter: createSignInRateLimiter(),
    },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  const email = `reset-${Date.now()}@example.com`;

  // Sign up user
  const signUpRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password: "OriginalPassword123",
      confirmPassword: "OriginalPassword123",
      displayName: "Reset Test",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  const cookieStr = signUpRes.headers["set-cookie"];
  const activeSessionCookie = (Array.isArray(cookieStr) ? cookieStr[0] : cookieStr).match(
    /tabang_session=([^;]+)/,
  )[0];

  // Request reset for known email returns { ok: true }
  const resetRes = await server.request("/api/app/password-reset", {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });
  assert.equal(resetRes.status, 200);
  assert.deepEqual(JSON.parse(resetRes.body), { ok: true });
  assert.ok(sentEmail);
  assert.equal(sentEmail.to, email);

  // Extract raw token from link
  const linkUrl = new URL(sentEmail.link);
  const token = linkUrl.searchParams.get("token");
  assert.ok(token);

  // Confirm with valid token
  const confirmRes = await server.request("/api/app/password-reset/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify({ token, password: "UpdatedPassword123" }),
  });
  assert.equal(confirmRes.status, 200);
  assert.deepEqual(JSON.parse(confirmRes.body), { ok: true });

  // REQ-004: confirming signs out all of that user's sessions
  const checkSession = await server.request("/api/app/session", {
    headers: { cookie: activeSessionCookie },
  });
  assert.equal(checkSession.status, 200);
  assert.equal(checkSession.body, "null");

  // Second use of token is refused (invalid_token)
  const reuseRes = await server.request("/api/app/password-reset/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify({ token, password: "AnotherPassword123" }),
  });
  assert.equal(reuseRes.status, 400);
  assert.equal(JSON.parse(reuseRes.body).error.code, "invalid_token");

  // Old password no longer works
  const oldLogin = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "OriginalPassword123" }),
  });
  assert.equal(oldLogin.status, 401);

  // New password works
  const newLogin = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "UpdatedPassword123" }),
  });
  assert.equal(newLogin.status, 200);

  // REQ-004: Without EMAIL_API_KEY outside production, the link is printed to console
  await sendPasswordReset({
    to: "dev@example.com",
    link: "http://example.test/update-password?token=devtoken",
    env: { NODE_ENV: "development" },
    log: (msg) => loggedLines.push(msg),
  });
  assert.ok(loggedLines.some((l) => l.includes("devtoken")));

  // With NODE_ENV=production, it is NOT printed to console
  const prodLogged = [];
  await sendPasswordReset({
    to: "prod@example.com",
    link: "http://example.test/update-password?token=prodtoken",
    env: { NODE_ENV: "production" },
    log: (msg) => prodLogged.push(msg),
  });
  assert.equal(prodLogged.length, 0);
});

test("REQ-005: sign-in rate limiting after 10 failures blocks 11th attempt", async (t) => {
  const store = createPostgresStore();
  const limiter = createSignInRateLimiter();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter },
  });

  const email = `ratelimit-${Date.now()}@example.com`;
  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
    "x-forwarded-for": `198.51.100.${Date.now() % 200}`,
  };

  for (let i = 0; i < 10; i++) {
    const res = await server.request("/api/app/sign-in", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "wrong" }),
    });
    assert.equal(res.status, 401);
  }

  // 11th failed attempt returns 429
  const res11 = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "wrong" }),
  });
  assert.equal(res11.status, 429);
  assert.equal(res11.headers["retry-after"], "900");
  const err11 = JSON.parse(res11.body);
  assert.equal(err11.error.code, "rate_limited");
  assert.equal(err11.error.message, "Too many attempts. Wait 15 minutes and try again.");
});

test("REQ-006: roles are current and reflect database changes immediately", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter: createSignInRateLimiter() },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  const email = `role-check-${Date.now()}@example.com`;

  // 1. Sign up as resident
  const signUpRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password: "Password12345",
      confirmPassword: "Password12345",
      displayName: "Applicant User",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  const cookieStr = signUpRes.headers["set-cookie"];
  const cookieMatch = (Array.isArray(cookieStr) ? cookieStr[0] : cookieStr).match(
    /tabang_session=([^;]+)/,
  );
  const sessionCookie = `tabang_session=${cookieMatch[1]}`;

  // Session initially reports resident
  const res1 = await server.request("/api/app/session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(JSON.parse(res1.body).role, "resident");

  const { rows: userRows } = await query("select id from public.users where email = $1", [email]);
  const userId = userRows[0].id;

  // 2. Reviewer approves application: insert role_assignment 'responder'
  await query("insert into public.role_assignments (user_id, role) values ($1, 'responder')", [
    userId,
  ]);

  // Next session check reports 'responder' immediately!
  const res2 = await server.request("/api/app/session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(JSON.parse(res2.body).role, "responder");

  // 3. Admin sets user back to 'resident' (deletes role assignment)
  await query("delete from public.role_assignments where user_id = $1", [userId]);

  // Next session check reports 'resident' immediately!
  const res3 = await server.request("/api/app/session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(JSON.parse(res3.body).role, "resident");
});

test("REQ-008: cross-site writes are refused on /api/app", async (t) => {
  const store = createPostgresStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  const email = `csrf-${Date.now()}@example.com`;

  // Missing Origin header -> 403 forbidden
  const noOriginRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password123", confirmPassword: "password123" }),
  });
  assert.equal(noOriginRes.status, 403);
  assert.equal(JSON.parse(noOriginRes.body).error.code, "forbidden");

  // Foreign Origin header -> 403 forbidden
  const foreignOriginRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: {
      origin: "http://malicious-site.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: "password123", confirmPassword: "password123" }),
  });
  assert.equal(foreignOriginRes.status, 403);
  assert.equal(JSON.parse(foreignOriginRes.body).error.code, "forbidden");

  // Non-JSON content type -> 403 forbidden
  const textRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: {
      origin: "http://example.test",
      "content-type": "text/plain",
    },
    body: JSON.stringify({ email, password: "password123", confirmPassword: "password123" }),
  });
  assert.equal(textRes.status, 403);
  assert.equal(JSON.parse(textRes.body).error.code, "forbidden");

  // Verify nothing was written to Postgres
  const { rows } = await query("select * from public.users where email = $1", [email]);
  assert.equal(rows.length, 0);
});
