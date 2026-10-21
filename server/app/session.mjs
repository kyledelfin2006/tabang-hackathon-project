import {
  normalizeEmail,
  validateProfileInput,
  validateSignupInput,
} from "../../src/services/auth/profile.js";
import { sendPasswordReset } from "../email.mjs";
import { ApiError } from "../http.mjs";
import {
  dummyVerifyPassword,
  generateToken,
  hashPassword,
  hashToken,
  parseSessionCookie,
  serializeClearSessionCookie,
  serializeSessionCookie,
  verifyPassword,
} from "../sessions.mjs";

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function isSecureCookie(req, env) {
  if (env.NODE_ENV === "production") {
    return true;
  }
  if (req.headers?.["x-forwarded-proto"] === "https") {
    return true;
  }
  const host = String(req.headers?.host || "");
  if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
    return false;
  }
  return true;
}

export function createSignInRateLimiter({
  maxFailures = 10,
  windowMs = 15 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const failures = new Map();

  function clean(timestamps, currentTime) {
    return timestamps.filter((t) => currentTime - t < windowMs);
  }

  return {
    isBlocked(email, ip) {
      const currentTime = now();
      const emailTimes = clean(failures.get(`email:${email}`) || [], currentTime);
      const ipTimes = clean(failures.get(`ip:${ip}`) || [], currentTime);
      return emailTimes.length >= maxFailures || ipTimes.length >= maxFailures;
    },
    recordFailure(email, ip) {
      const currentTime = now();
      const emailKey = `email:${email}`;
      const ipKey = `ip:${ip}`;
      const emailTimes = clean(failures.get(emailKey) || [], currentTime);
      const ipTimes = clean(failures.get(ipKey) || [], currentTime);
      emailTimes.push(currentTime);
      ipTimes.push(currentTime);
      failures.set(emailKey, emailTimes);
      failures.set(ipKey, ipTimes);
    },
    reset(email) {
      failures.delete(`email:${email}`);
    },
    clear() {
      failures.clear();
    },
  };
}

export const defaultSignInLimiter = createSignInRateLimiter();

export const SESSION_ROUTES = [
  {
    method: "GET",
    path: "/api/app/session",
    handler: async ({ req, store }) => {
      const token = parseSessionCookie(req);
      if (!token) {
        return { status: 200, body: null };
      }

      const tokenHash = hashToken(token);
      const session = await store.findSessionByTokenHash(tokenHash);
      if (!session) {
        return { status: 200, body: null };
      }

      return {
        status: 200,
        body: {
          user: {
            uid: session.user.id,
            email: session.user.email,
            displayName: session.profile?.displayName || "",
            emailVerified: true,
          },
          role: session.role || "resident",
          profile: session.profile,
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/sign-up",
    handler: async ({ req, body, store, env }) => {
      const { values, errors, isValid } = validateSignupInput(body);
      if (!isValid) {
        const firstMessage = Object.values(errors)[0] || "Validation failed.";
        throw new ApiError(400, "invalid_request", firstMessage);
      }

      const existing = await store.findUserByEmail(values.email);
      if (existing) {
        throw new ApiError(400, "already_registered", "This email is already registered.");
      }

      const passwordHash = hashPassword(values.password);
      const user = await store.createUserWithProfile({
        email: values.email,
        passwordHash,
        displayName: values.displayName,
        phone: values.phone,
        barangay: values.barangay,
      });

      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await store.createSession({ userId: user.id, tokenHash, expiresAt });

      const cookie = serializeSessionCookie(token, {
        secure: isSecureCookie(req, env),
        expiresAt,
      });

      return {
        status: 200,
        headers: { "Set-Cookie": cookie },
        body: {
          user: {
            uid: user.id,
            email: user.email,
            displayName: values.displayName,
            emailVerified: true,
          },
          role: "resident",
          profile: {
            displayName: values.displayName,
            email: user.email,
            phone: values.phone,
            barangay: values.barangay,
          },
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/sign-in",
    handler: async ({ req, body, store, env, limiter = env.limiter || defaultSignInLimiter }) => {
      const email = normalizeEmail(body?.email);
      const password = typeof body?.password === "string" ? body.password : "";
      const ip = clientIp(req);

      if (limiter.isBlocked(email, ip)) {
        throw new ApiError(429, "rate_limited", "Too many attempts. Wait 15 minutes and try again.");
      }

      if (!email || !password) {
        throw new ApiError(400, "invalid_request", "Enter your email and password.");
      }

      const user = await store.findUserByEmail(email);
      if (!user) {
        dummyVerifyPassword(password);
        limiter.recordFailure(email, ip);
        throw new ApiError(401, "invalid_credentials", "Invalid email or password.");
      }

      const valid = verifyPassword(password, user.passwordHash);
      if (!valid) {
        limiter.recordFailure(email, ip);
        throw new ApiError(401, "invalid_credentials", "Invalid email or password.");
      }

      limiter.reset(email);

      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await store.createSession({ userId: user.id, tokenHash, expiresAt });

      const cookie = serializeSessionCookie(token, {
        secure: isSecureCookie(req, env),
        expiresAt,
      });

      return {
        status: 200,
        headers: { "Set-Cookie": cookie },
        body: {
          user: {
            uid: user.id,
            email: user.email,
            displayName: user.profile?.displayName || "",
            emailVerified: true,
          },
          role: user.role || "resident",
          profile: user.profile,
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/sign-out",
    handler: async ({ req, store, env }) => {
      const token = parseSessionCookie(req);
      if (token) {
        const tokenHash = hashToken(token);
        await store.deleteSession(tokenHash);
      }

      const clearCookie = serializeClearSessionCookie({ secure: isSecureCookie(req, env) });

      return {
        status: 200,
        headers: { "Set-Cookie": clearCookie },
        body: { ok: true },
      };
    },
  },
  {
    method: "PATCH",
    path: "/api/app/profile",
    handler: async ({ req, body, store }) => {
      const token = parseSessionCookie(req);
      if (!token) {
        throw new ApiError(401, "unauthorized", "Sign-in required.");
      }

      const tokenHash = hashToken(token);
      const session = await store.findSessionByTokenHash(tokenHash);
      if (!session) {
        throw new ApiError(401, "unauthorized", "Sign-in required.");
      }

      const { values, errors, isValid } = validateProfileInput(body);
      if (!isValid) {
        const firstMessage = Object.values(errors)[0] || "Validation failed.";
        throw new ApiError(400, "invalid_request", firstMessage);
      }

      const updated = await store.updateProfile(session.user.id, values);

      return {
        status: 200,
        body: {
          profile: {
            displayName: updated?.displayName || values.displayName,
            email: session.user.email,
            phone: updated?.phone || values.phone,
            barangay: updated?.barangay || values.barangay,
          },
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/password-reset",
    handler: async ({ req, body, store, env }) => {
      const email = normalizeEmail(body?.email);

      if (email) {
        const user = await store.findUserByEmail(email);
        if (user) {
          const token = generateToken();
          const tokenHash = hashToken(token);
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

          await store.createPasswordReset({ userId: user.id, tokenHash, expiresAt });

          const proto = req.headers?.["x-forwarded-proto"] || "http";
          const host = req.headers?.host || "127.0.0.1:8000";
          const appOrigin = env.APP_ORIGIN || `${proto}://${host}`;
          const link = `${appOrigin}/update-password?token=${token}`;

          await sendPasswordReset({ to: user.email, link, env });
        }
      }

      // Always return identical success response
      return {
        status: 200,
        body: { ok: true },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/password-reset/confirm",
    handler: async ({ body, store }) => {
      const token = typeof body?.token === "string" ? body.token : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!token || password.length < 8) {
        throw new ApiError(400, "invalid_request", "Password must be at least 8 characters.");
      }

      const tokenHash = hashToken(token);
      const reset = await store.findPasswordReset(tokenHash);

      if (!reset || reset.usedAt || Date.parse(reset.expiresAt) <= Date.now()) {
        throw new ApiError(400, "invalid_token", "This link has expired. Ask for a new one.");
      }

      const newPasswordHash = hashPassword(password);
      await store.usePasswordReset(tokenHash, newPasswordHash, reset.userId);

      return {
        status: 200,
        body: { ok: true },
      };
    },
  },
  {
    method: "POST",
    path: "/api/app/password",
    handler: async ({ req, body, store }) => {
      const token = parseSessionCookie(req);
      if (!token) {
        throw new ApiError(401, "unauthorized", "Sign-in required.");
      }

      const tokenHash = hashToken(token);
      const session = await store.findSessionByTokenHash(tokenHash);
      if (!session) {
        throw new ApiError(401, "unauthorized", "Sign-in required.");
      }

      const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

      if (newPassword.length < 8) {
        throw new ApiError(400, "invalid_request", "New password must be at least 8 characters.");
      }

      const user = await store.findUserById(session.user.id);
      if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        throw new ApiError(401, "invalid_credentials", "Current password is incorrect.");
      }

      const newHash = hashPassword(newPassword);
      await store.updateUserPassword(session.user.id, newHash);

      return {
        status: 200,
        body: { ok: true },
      };
    },
  },
];
