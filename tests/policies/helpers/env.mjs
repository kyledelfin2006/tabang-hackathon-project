import { existsSync, readFileSync } from "node:fs";

// Policy tests run against the local stack only. Values come from the
// environment or the gitignored .env, and a hosted URL is refused so a test can
// never write to a real project.
export function loadLocalEnv() {
  const fromFile = new Map();

  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);

      if (match) {
        fromFile.set(match[1], match[2]);
      }
    }
  }

  const read = (key) => process.env[key] || fromFile.get(key) || "";
  const url = read("SUPABASE_URL") || read("VITE_SUPABASE_URL");
  const publishableKey = read("VITE_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = read("SUPABASE_SECRET_KEY");

  if (!url || !publishableKey) {
    throw new Error(
      "Set SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from `npx supabase status`.",
    );
  }

  const { hostname } = new URL(url);

  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Policy tests only run against a local stack, not ${hostname}.`);
  }

  return { url, publishableKey, secretKey };
}
