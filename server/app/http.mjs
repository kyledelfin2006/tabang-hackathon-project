import { randomUUID } from "node:crypto";
import { ApiError } from "../http.mjs";
import { requestLine } from "../log.mjs";
import { checkOrigin } from "./origin.mjs";
import { APP_ROUTES } from "./routes.mjs";

const DEFAULT_MAX_BODY_BYTES = 8 * 1024;

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxBytes) {
        reject(new ApiError(413, "invalid_request", "The request body is too large."));
        if (size > maxBytes * 8) {
          req.destroy();
        }
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (size > maxBytes) {
        return;
      }

      const text = Buffer.concat(chunks).toString("utf8");

      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new ApiError(400, "invalid_request", "The request body is not valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function readBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxBytes) {
        reject(new ApiError(413, "invalid_request", "The request body is too large."));
        if (size > maxBytes * 8) {
          req.destroy();
        }
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (size > maxBytes) {
        return;
      }

      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function matchPath(pattern, pathname) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (const [index, part] of patternParts.entries()) {
    if (part.startsWith("{") && part.endsWith("}")) {
      params[part.slice(1, -1)] = pathParts[index];
    } else if (part !== pathParts[index]) {
      return null;
    }
  }

  return params;
}

export function createAppApiHandler({
  routes = APP_ROUTES,
  store,
  env = {},
  log = () => {},
  now = () => Date.now(),
}) {
  return async function handleAppApi(req, res, { pathname, search }) {
    const requestId = randomUUID();
    const started = now();
    let status = 500;

    res.setHeader("X-Request-Id", requestId);

    const fail = (error) => {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "internal", "Something went wrong on our side.");

      status = apiError.status;
      send(
        res,
        apiError.status,
        { error: { code: apiError.code, message: apiError.message, requestId } },
        apiError.status === 429 ? { "Retry-After": "900" } : {},
      );
    };

    try {
      const candidates = routes
        .map((route) => ({ route, params: matchPath(route.path, pathname) }))
        .filter(({ params }) => params);

      if (candidates.length === 0) {
        throw new ApiError(404, "not_found", "There is no such API route.");
      }

      const match = candidates.find(
        ({ route }) =>
          route.method === req.method || (req.method === "HEAD" && route.method === "GET"),
      );

      if (!match) {
        res.setHeader("Allow", candidates.map(({ route }) => route.method).join(", "));
        throw new ApiError(405, "method_not_allowed", "That method is not allowed here.");
      }

      const { route, params } = match;

      // Origin and content-type checks on state-changing requests
      const originResult = checkOrigin(req, { env, isUpload: route.isUpload });
      if (!originResult.ok) {
        throw new ApiError(originResult.status, originResult.code, originResult.message);
      }

      if (!store) {
        throw new ApiError(503, "unavailable", "The API is not configured on this server.");
      }

      let body;

      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (!route.isUpload) {
          if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
            throw new ApiError(400, "invalid_request", "Send the body as application/json.");
          }

          body = await readJson(req, route.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
        } else {
          body = await readBuffer(req, route.maxBodyBytes ?? 5 * 1024 * 1024);
        }
      }

      const result = await route.handler({
        query: new URLSearchParams(search),
        params,
        body,
        store,
        env,
        req,
        res,
        now,
      });

      status = result.status ?? 200;

      if (result.stream) {
        res.writeHead(status, result.headers ?? {});
        if (req.method === "HEAD") {
          res.end();
        } else {
          result.stream.on("error", (err) => {
            if (!res.headersSent) {
              fail(err);
            } else {
              res.destroy();
            }
          });
          result.stream.pipe(res);
        }
        return;
      }

      send(res, status, req.method === "HEAD" ? undefined : result.body, result.headers);
    } catch (error) {
      fail(error);
    } finally {
      log(
        requestLine({
          time: new Date(started).toISOString(),
          requestId,
          method: req.method,
          path: pathname,
          status,
          ms: now() - started,
          clientId: null,
        }),
      );
    }
  };
}
