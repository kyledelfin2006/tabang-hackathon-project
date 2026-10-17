import { randomUUID } from "node:crypto";
import { authenticateClient } from "./auth.mjs";
import { requestLine } from "./log.mjs";
import { createRateLimiter } from "./rateLimit.mjs";

const DEFAULT_MAX_BODY_BYTES = 8 * 1024;

/** An error a handler throws to answer with a specific status and code. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

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

      // Keep reading and discarding for a while, so an ordinary client
      // receives the 413 instead of a reset connection; a sender that keeps
      // going far past the limit is cut off.
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

function clientIp(req) {
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Builds the /api handler from a route table.
 *
 * Each route is `{ method, path, scope?, usesStore?, cors?, maxBodyBytes?,
 * handler }`. A route with a `scope` needs a partner API key that carries it;
 * every other route is public and limited per IP instead. Handlers receive
 * `{ query, params, body, client, store, env }` and return
 * `{ status?, body, headers? }`. Every response carries X-Request-Id, and every
 * failure uses the one error envelope.
 */
export function createApiHandler({
  routes,
  store,
  env = {},
  log = () => {},
  now = () => Date.now(),
}) {
  const limitPerMinute = Number(env.API_RATE_LIMIT_PER_MINUTE) || 60;
  const limiter = createRateLimiter({ limitPerMinute, now });

  return async function handleApi(req, res, { pathname, search }) {
    const requestId = randomUUID();
    const started = now();
    let client = null;
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
        apiError.status === 429 ? { "Retry-After": "60" } : {},
      );
    };

    try {
      const candidates = routes
        .map((route) => ({ route, params: matchPath(route.path, pathname) }))
        .filter(({ params }) => params);

      if (candidates.length === 0) {
        throw new ApiError(404, "not_found", "There is no such API route.");
      }

      const match = candidates.find(({ route }) => route.method === req.method);

      if (!match) {
        res.setHeader("Allow", candidates.map(({ route }) => route.method).join(", "));
        throw new ApiError(405, "method_not_allowed", "That method is not allowed here.");
      }

      const { route, params } = match;

      if (route.cors) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }

      if ((route.scope || route.usesStore) && !store) {
        throw new ApiError(503, "unavailable", "The API is not configured on this server.");
      }

      if (route.scope) {
        client = await authenticateClient(req.headers.authorization, {
          findClient: store.findApiClient,
        });

        if (!client) {
          throw new ApiError(401, "unauthorized", "A valid API key is required.");
        }

        if (!limiter.take(`client:${client.id}`)) {
          throw new ApiError(429, "rate_limited", "Too many requests. Try again in a minute.");
        }

        if (!client.scopes.includes(route.scope)) {
          throw new ApiError(403, "forbidden", `This key does not have the ${route.scope} scope.`);
        }
      } else if (!limiter.take(`ip:${clientIp(req)}`)) {
        throw new ApiError(429, "rate_limited", "Too many requests. Try again in a minute.");
      }

      let body;

      if (req.method === "POST") {
        if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
          throw new ApiError(400, "invalid_request", "Send the body as application/json.");
        }

        body = await readJson(req, route.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      }

      const result = await route.handler({
        query: new URLSearchParams(search),
        params,
        body,
        client,
        store,
        env,
      });

      status = result.status ?? 200;
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
          clientId: client?.id ?? null,
        }),
      );
    }
  };
}
