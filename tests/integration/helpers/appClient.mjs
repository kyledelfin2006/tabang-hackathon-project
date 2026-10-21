import { randomUUID } from "node:crypto";
import { query } from "../../../server/db.mjs";

export function createApiClient(server, { origin = "http://example.test", cookie = null } = {}) {
  let sessionCookie = cookie;

  async function request(path, { method = "GET", body = null, headers = {} } = {}) {
    const reqHeaders = { ...headers };
    if (sessionCookie && !reqHeaders.cookie) {
      reqHeaders.cookie = sessionCookie;
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      if (!reqHeaders.origin) reqHeaders.origin = origin;
      if (!reqHeaders["content-type"]) reqHeaders["content-type"] = "application/json";
    }

    const payload = body !== null && typeof body === "object" ? JSON.stringify(body) : body;
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
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      json = res.body;
    }

    return {
      status: res.status,
      headers: res.headers,
      body: json,
      rawBody: res.body,
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

  return {
    id: userId,
    email,
    role,
    client,
  };
}
