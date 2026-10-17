import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createApiHandler } from "./http.mjs";
import { logToStdout } from "./log.mjs";
import { buildSecurityHeaders } from "./securityHeaders.mjs";
import { redirectLegacyUrl } from "./legacyRedirects.mjs";
import { API_ROUTES } from "./routes/index.mjs";
import { parseRequestTarget, serveStatic } from "./static.mjs";
import { createSupabaseStore } from "./store.mjs";
import { createSupabaseAdmin } from "./supabaseAdmin.mjs";

function defaultStore(env) {
  const admin = createSupabaseAdmin(env);

  return admin ? createSupabaseStore(admin) : null;
}

export function createAppServer({
  distRoot = resolve("dist"),
  env = process.env,
  store = defaultStore(env),
  routes = API_ROUTES,
  log = logToStdout,
  now,
} = {}) {
  const securityHeaders = buildSecurityHeaders({
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  });
  const handleApi = createApiHandler({ routes, store, env, log, now });

  return createServer((req, res) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      res.setHeader(name, value);
    }

    const parsed = parseRequestTarget(req.url ?? "/");

    if (parsed.error) {
      res.writeHead(parsed.error, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }

    const { pathname, search } = parsed;

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      handleApi(req, res, { pathname, search });
      return;
    }

    if (redirectLegacyUrl(req, res, pathname, search)) {
      return;
    }

    serveStatic(req, res, { distRoot, pathname });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8000);

  createAppServer().listen(port, host, () => {
    console.log(`Tabang is running at http://${host}:${port}/`);
  });
}
