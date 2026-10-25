const REQUIRED_SUPABASE_ENV_KEYS = Object.freeze([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
]);

function readEnvValue(envSource, key) {
  const value = envSource?.[key];

  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the browser's Supabase settings.
 *
 * Only the publishable key belongs here. The secret key bypasses row-level
 * security and lives in the server's environment alone, so it has no VITE_
 * name and can never be inlined into the bundle.
 */
export function resolveSupabaseConfig(envSource = import.meta.env) {
  const missingKeys = REQUIRED_SUPABASE_ENV_KEYS.filter(
    (key) => !readEnvValue(envSource, key),
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing Supabase environment variables: ${missingKeys.join(", ")}. Copy .env.example to .env and fill in the VITE_SUPABASE_* values before enabling Supabase-backed routes.`,
    );
  }

  const url = readEnvValue(envSource, "VITE_SUPABASE_URL");

  try {
    new URL(url);
  } catch {
    throw new Error(`VITE_SUPABASE_URL must be a full URL. Received "${url}".`);
  }

  return Object.freeze({
    url,
    publishableKey: readEnvValue(envSource, "VITE_SUPABASE_PUBLISHABLE_KEY"),
  });
}

export { REQUIRED_SUPABASE_ENV_KEYS };