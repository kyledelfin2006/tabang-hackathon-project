import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "./memoryStore.mjs";
import { startTestServer } from "./testServer.mjs";
import { createSignInRateLimiter } from "../../server/app/session.mjs";

test("GET /api/app/session returns null when not signed in", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, { store });

  const res = await server.request("/api/app/session");
  assert.equal(res.status, 200);
  assert.equal(res.body, "null");
});

test("REQ-003: sign-up, session, sign-out lifecycle with in-memory store", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter: createSignInRateLimiter() },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  // 1. Sign up with valid resident info
  const signUpRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "resident@example.com",
      password: "password123",
      confirmPassword: "password123",
      displayName: "Juan dela Cruz",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });

  assert.equal(signUpRes.status, 200);
  const signUpBody = JSON.parse(signUpRes.body);
  assert.equal(signUpBody.role, "resident");
  assert.equal(signUpBody.user.email, "resident@example.com");
  assert.equal(signUpBody.profile.displayName, "Juan dela Cruz");
  assert.equal(signUpBody.profile.barangay, "Poblacion");

  // Verify Set-Cookie header
  const setCookie = signUpRes.headers["set-cookie"];
  assert.ok(setCookie, "Set-Cookie must be present");
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.match(cookieStr, /tabang_session=/);
  assert.match(cookieStr, /HttpOnly/i);
  assert.match(cookieStr, /SameSite=Lax/i);
  assert.match(cookieStr, /Path=\//);

  // Extract cookie value for subsequent requests
  const match = cookieStr.match(/tabang_session=([^;]+)/);
  const cookieValue = match ? match[1] : "";
  const cookieHeader = `tabang_session=${cookieValue}`;

  // 2. GET /api/app/session with valid cookie
  const sessionRes = await server.request("/api/app/session", {
    headers: { cookie: cookieHeader },
  });
  assert.equal(sessionRes.status, 200);
  const sessionBody = JSON.parse(sessionRes.body);
  assert.equal(sessionBody.role, "resident");
  assert.equal(sessionBody.user.email, "resident@example.com");
  assert.equal(sessionBody.profile.displayName, "Juan dela Cruz");

  // 3. Update profile
  const profileRes = await server.request("/api/app/profile", {
    method: "PATCH",
    headers: { ...headers, cookie: cookieHeader },
    body: JSON.stringify({
      displayName: "Juan D. Cruz",
      phone: "09187654321",
      barangay: "San Roque",
    }),
  });
  assert.equal(profileRes.status, 200);
  const profileBody = JSON.parse(profileRes.body);
  assert.equal(profileBody.profile.displayName, "Juan D. Cruz");
  assert.equal(profileBody.profile.barangay, "San Roque");

  // 4. Sign out
  const signOutRes = await server.request("/api/app/sign-out", {
    method: "POST",
    headers: { ...headers, cookie: cookieHeader },
  });
  assert.equal(signOutRes.status, 200);
  const clearCookie = signOutRes.headers["set-cookie"];
  const clearStr = Array.isArray(clearCookie) ? clearCookie[0] : clearCookie;
  assert.match(clearStr, /Max-Age=0/i);

  // 5. Subsequent GET /api/app/session returns null
  const afterSignOut = await server.request("/api/app/session", {
    headers: { cookie: cookieHeader },
  });
  assert.equal(afterSignOut.status, 200);
  assert.equal(afterSignOut.body, "null");
});

test("REQ-003: sign-up rejects duplicate email and invalid input", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter: createSignInRateLimiter() },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  // Valid sign up
  const res1 = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "duplicate@example.com",
      password: "password123",
      confirmPassword: "password123",
      displayName: "Juan",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  assert.equal(res1.status, 200);

  // Duplicate email
  const res2 = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "duplicate@example.com",
      password: "password123",
      confirmPassword: "password123",
      displayName: "Other",
      phone: "09179999999",
      barangay: "Poblacion",
    }),
  });
  assert.equal(res2.status, 400);
  const err2 = JSON.parse(res2.body);
  assert.equal(err2.error.code, "already_registered");

  // Invalid input (short password)
  const res3 = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "valid@example.com",
      password: "short",
      confirmPassword: "short",
      displayName: "Valid",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  assert.equal(res3.status, 400);
  const err3 = JSON.parse(res3.body);
  assert.equal(err3.error.code, "invalid_request");
});

test("REQ-003: sign-in with wrong password or unknown email returns identical message", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test", limiter: createSignInRateLimiter() },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
  };

  // Unknown email
  const resUnknown = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "unknown@example.com", password: "password123" }),
  });
  assert.equal(resUnknown.status, 401);
  const errUnknown = JSON.parse(resUnknown.body);
  assert.equal(errUnknown.error.code, "invalid_credentials");

  // Sign up real user
  await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "real@example.com",
      password: "password123",
      confirmPassword: "password123",
      displayName: "Real User",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });

  // Wrong password
  const resWrong = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "real@example.com", password: "wrongpassword" }),
  });
  assert.equal(resWrong.status, 401);
  const errWrong = JSON.parse(resWrong.body);
  assert.equal(errWrong.error.code, "invalid_credentials");
  assert.equal(errUnknown.error.message, errWrong.error.message);
});

test("REQ-005: sign-in rate limiter blocks after 10 failures", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, {
    store,
    env: {
      APP_ORIGIN: "http://example.test",
      limiter: createSignInRateLimiter(),
    },
  });

  const headers = {
    origin: "http://example.test",
    "content-type": "application/json",
    "x-forwarded-for": "198.51.100.1",
  };

  // 10 failed sign-in attempts
  for (let i = 0; i < 10; i++) {
    const res = await server.request("/api/app/sign-in", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "rate-limited@example.com", password: "wrong" }),
    });
    assert.equal(res.status, 401);
  }

  // 11th attempt must be 429 rate_limited
  const res11 = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "rate-limited@example.com", password: "wrong" }),
  });
  assert.equal(res11.status, 429);
  assert.equal(res11.headers["retry-after"], "900");
  const err11 = JSON.parse(res11.body);
  assert.equal(err11.error.code, "rate_limited");
  assert.equal(err11.error.message, "Too many attempts. Wait 15 minutes and try again.");
});

test("REQ-004: password reset request and confirm lifecycle", async (t) => {
  const store = createMemoryStore();
  let sentEmail = null;
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

  // 1. Sign up user
  const signUpRes = await server.request("/api/app/sign-up", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "resetme@example.com",
      password: "initialPassword123",
      confirmPassword: "initialPassword123",
      displayName: "Reset User",
      phone: "09171234567",
      barangay: "Poblacion",
    }),
  });
  assert.equal(signUpRes.status, 200);
  const cookieStr = signUpRes.headers["set-cookie"];
  const cookieMatch = (Array.isArray(cookieStr) ? cookieStr[0] : cookieStr).match(/tabang_session=([^;]+)/);
  const activeSessionCookie = `tabang_session=${cookieMatch[1]}`;

  // 2. Request reset for unknown email returns 200 { ok: true } and does not send email
  const unkReset = await server.request("/api/app/password-reset", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "nonexistent@example.com" }),
  });
  assert.equal(unkReset.status, 200);
  assert.deepEqual(JSON.parse(unkReset.body), { ok: true });
  assert.equal(sentEmail, null);

  // 3. Request reset for real email returns 200 { ok: true } and sends email with link
  const realReset = await server.request("/api/app/password-reset", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "resetme@example.com" }),
  });
  assert.equal(realReset.status, 200);
  assert.deepEqual(JSON.parse(realReset.body), { ok: true });
  assert.ok(sentEmail, "Email adapter should have received reset link");
  assert.equal(sentEmail.to, "resetme@example.com");
  assert.match(sentEmail.link, /^http:\/\/example\.test\/update-password\?token=[0-9a-f]+/);

  // Extract token from sentEmail link
  const url = new URL(sentEmail.link);
  const rawToken = url.searchParams.get("token");
  assert.ok(rawToken, "Token must be present in reset link");

  // 4. Confirm with an invalid token -> 400 invalid_token
  const badConfirm = await server.request("/api/app/password-reset/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify({ token: "invalid-token", password: "brandNewPassword123" }),
  });
  assert.equal(badConfirm.status, 400);

  // Confirm with valid token
  const confirmRes = await server.request("/api/app/password-reset/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify({ token: rawToken, password: "brandNewPassword123" }),
  });
  assert.equal(confirmRes.status, 200);
  assert.deepEqual(JSON.parse(confirmRes.body), { ok: true });

  // Second use of the same token -> 400 invalid_token
  const secondUse = await server.request("/api/app/password-reset/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify({ token: rawToken, password: "anotherPassword123" }),
  });
  assert.equal(secondUse.status, 400);
  assert.equal(JSON.parse(secondUse.body).error.code, "invalid_token");

  // REQ-004: Confirming password reset signs out all active sessions for that user
  const checkSession = await server.request("/api/app/session", {
    headers: { cookie: activeSessionCookie },
  });
  assert.equal(checkSession.status, 200);
  assert.equal(checkSession.body, "null");

  // Old password no longer works
  const oldLogin = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "resetme@example.com", password: "initialPassword123" }),
  });
  assert.equal(oldLogin.status, 401);

  // New password works
  const newLogin = await server.request("/api/app/sign-in", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "resetme@example.com", password: "brandNewPassword123" }),
  });
  assert.equal(newLogin.status, 200);
});

test("REQ-008: state-changing requests require valid Origin and JSON content type", async (t) => {
  const store = createMemoryStore();
  const server = await startTestServer(t, {}, {
    store,
    env: { APP_ORIGIN: "http://example.test" },
  });

  // Missing Origin header -> 403 forbidden
  const noOrigin = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(noOrigin.status, 403);
  assert.equal(JSON.parse(noOrigin.body).error.code, "forbidden");

  // Foreign Origin header -> 403 forbidden
  const foreignOrigin = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: {
      origin: "http://evil-attacker.com",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(foreignOrigin.status, 403);
  assert.equal(JSON.parse(foreignOrigin.body).error.code, "forbidden");

  // Non-JSON content type -> 403 forbidden
  const wrongContentType = await server.request("/api/app/sign-up", {
    method: "POST",
    headers: {
      origin: "http://example.test",
      "content-type": "text/plain",
    },
    body: "hello",
  });
  assert.equal(wrongContentType.status, 403);
  assert.equal(JSON.parse(wrongContentType.body).error.code, "forbidden");
});
