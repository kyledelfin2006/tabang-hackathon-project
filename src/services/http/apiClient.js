export function createApiClient({ fetchFn = globalThis.fetch, baseUrl = "" } = {}) {
  async function request(path, { method = "GET", headers = {}, body, query, signal } = {}) {
    let url = `${baseUrl}${path}`;

    if (query) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          searchParams.set(k, String(v));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }

    const reqHeaders = { ...headers };
    let reqBody = body;

    const isBinaryOrForm =
      Boolean(globalThis.Buffer?.isBuffer(body)) ||
      (typeof Blob !== "undefined" && body instanceof Blob) ||
      (typeof File !== "undefined" && body instanceof File) ||
      (typeof FormData !== "undefined" && body instanceof FormData) ||
      (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) ||
      (typeof Uint8Array !== "undefined" && body instanceof Uint8Array);

    if (body !== undefined && body !== null && !isBinaryOrForm && typeof body === "object") {
      reqHeaders["Content-Type"] = "application/json";
      reqBody = JSON.stringify(body);
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
      if (!reqHeaders["Content-Type"] && !reqHeaders["content-type"] && !isBinaryOrForm) {
        reqHeaders["Content-Type"] = "application/json";
      }
    }

    const res = await fetchFn(url, {
      method,
      headers: reqHeaders,
      body: reqBody,
      credentials: "same-origin",
      signal,
    });

    if (res.status === 204) {
      return null;
    }

    const contentType = res.headers?.get?.("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const errorObj = data?.error;
      const code =
        errorObj?.code ||
        (res.status === 403
          ? "forbidden"
          : res.status === 404
            ? "not_found"
            : res.status === 400
              ? "invalid_request"
              : res.status === 401
                ? "unauthorized"
                : "unknown");

      const err = new Error(errorObj?.message || `Request failed with status ${res.status}`);
      err.code = code;
      err.status = res.status;
      err.statusCode = res.status;
      err.cause = errorObj || { status: res.status };
      throw err;
    }

    return data;
  }

  return {
    get: (path, options) => request(path, { method: "GET", ...options }),
    post: (path, body, options) => request(path, { method: "POST", body, ...options }),
    put: (path, body, options) => request(path, { method: "PUT", body, ...options }),
    patch: (path, body, options) => request(path, { method: "PATCH", body, ...options }),
    delete: (path, options) => request(path, { method: "DELETE", ...options }),
    request,
  };
}

let defaultClient;
export function getApiClient() {
  if (!defaultClient) {
    defaultClient = createApiClient();
  }
  return defaultClient;
}
