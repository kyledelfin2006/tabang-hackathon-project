import { randomUUID } from "node:crypto";
import { query } from "../../../server/db.mjs";
import { createApiClient as createHttpClient } from "../../../src/services/http/apiClient.js";

export function createCookieFetch(server, { origin = "http://example.test", cookie = null } = {}) {
  let sessionCookie = cookie;

  const fetchFn = async (url, options = {}) => {
    const path =
      typeof url === "string"
        ? url.startsWith("http")
          ? new URL(url).pathname + new URL(url).search
          : url
        : String(url);

    const reqHeaders = { ...(options.headers || {}) };
    if (sessionCookie && !reqHeaders.cookie && !reqHeaders.Cookie) {
      reqHeaders.cookie = sessionCookie;
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes((options.method || "GET").toUpperCase())) {
      if (!reqHeaders.origin && !reqHeaders.Origin) {
        reqHeaders.origin = origin;
      }
    }

    let bodyPayload = options.body;
    if (typeof Blob !== "undefined" && bodyPayload instanceof Blob) {
      bodyPayload = Buffer.from(await bodyPayload.arrayBuffer());
    }

    const res = await server.request(path, {
      method: options.method || "GET",
      headers: reqHeaders,
      body: bodyPayload,
    });

    const setCookie = res.headers["set-cookie"];
    if (setCookie) {
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const match = cookieStr.match(/tabang_session=([^;]+)/);
      if (match) {
        sessionCookie = `tabang_session=${match[1]}`;
      } else if (
        cookieStr.includes("Max-Age=0") ||
        cookieStr.includes("Expires=Thu, 01 Jan 1970")
      ) {
        sessionCookie = null;
      }
    }

    const responseHeaders = new Headers(res.headers);
    return new Response(res.buffer || res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  };

  return {
    fetchFn,
    get cookie() {
      return sessionCookie;
    },
    set cookie(val) {
      sessionCookie = val;
    },
  };
}

export function createCookieApiClient(server, { origin = "http://example.test", cookie = null } = {}) {
  const cookieJar = createCookieFetch(server, { origin, cookie });
  const client = createHttpClient({ fetchFn: cookieJar.fetchFn });
  client.cookieJar = cookieJar;
  return client;
}

export function createApiClient(server, { origin = "http://example.test", cookie = null } = {}) {
  let sessionCookie = cookie;

  async function request(path, { method = "GET", body = null, headers = {} } = {}) {
    const reqHeaders = { ...headers };
    if (sessionCookie && !reqHeaders.cookie) {
      reqHeaders.cookie = sessionCookie;
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      if (!reqHeaders.origin) reqHeaders.origin = origin;
      if (!reqHeaders["content-type"] && !Buffer.isBuffer(body)) {
        reqHeaders["content-type"] = "application/json";
      }
    }

    const payload =
      body !== null && typeof body === "object" && !Buffer.isBuffer(body)
        ? JSON.stringify(body)
        : body;
    const res = await server.request(path, { method, headers: reqHeaders, body: payload });

    // Track Set-Cookie if returned
    const setCookie = res.headers["set-cookie"];
    if (setCookie) {
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const match = cookieStr.match(/tabang_session=([^;]+)/);
      if (match) {
        sessionCookie = `tabang_session=${match[1]}`;
      } else if (cookieStr.includes("Max-Age=0") || cookieStr.includes("Expires=Thu, 01 Jan 1970")) {
        sessionCookie = null;
      }
    }

    let json;
    try {
      json = typeof res.body === "string" ? JSON.parse(res.body) : null;
    } catch {
      json = res.body;
    }

    return {
      status: res.status,
      headers: res.headers,
      body: json,
      rawBody: res.body,
      buffer: res.buffer,
    };
  }

  return {
    get: (path, options) => request(path, { method: "GET", ...options }),
    post: (path, body, options) => request(path, { method: "POST", body, ...options }),
    put: (path, body, options) => request(path, { method: "PUT", body, ...options }),
    patch: (path, body, options) => request(path, { method: "PATCH", body, ...options }),
    delete: (path, options) => request(path, { method: "DELETE", ...options }),
    get cookie() {
      return sessionCookie;
    },
    set cookie(val) {
      sessionCookie = val;
    },
  };
}

export async function createSignedInUser(server, { role = "resident", overrides = {} } = {}) {
  const id = randomUUID();
  const email = `${role}-${id.slice(0, 8)}@example.test`;
  const password = "Password12345";
  const displayName = overrides.displayName || `Test ${role}`;
  const phone = overrides.phone || "09171234567";
  const barangay = overrides.barangay || "Poblacion";

  const client = createApiClient(server);

  const signUpRes = await client.post("/api/app/sign-up", {
    email,
    password,
    confirmPassword: password,
    displayName,
    phone,
    barangay,
  });

  if (signUpRes.status !== 200) {
    throw new Error(`Failed to create user: ${JSON.stringify(signUpRes.body)}`);
  }

  const userId = signUpRes.body.user.uid;

  if (role !== "resident") {
    await query("insert into public.role_assignments (user_id, role) values ($1, $2)", [
      userId,
      role,
    ]);
  }

  const appClient = createCookieApiClient(server, { cookie: client.cookie });

  return {
    id: userId,
    email,
    role,
    client,
    appClient,
  };
}
