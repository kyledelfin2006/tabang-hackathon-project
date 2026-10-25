import { createClient } from "@supabase/supabase-js";

/**
 * The one server-side Supabase client.
 *
 * It uses the secret key, which bypasses row-level security, so it lives only
 * in the server's environment and is created only here; providerIsolation
 * tests enforce that. It keeps no session. Returns null when the server has no
 * Supabase settings, so routes that need the database answer 503 instead of
 * crashing the process.
 */
export function createSupabaseAdmin(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    return null;
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}