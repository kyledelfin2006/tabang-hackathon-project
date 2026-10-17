import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./env.js";

let cachedClient;

/**
 * The one browser Supabase client.
 *
 * This file and server/supabaseAdmin.mjs are the only places allowed to import
 * @supabase/supabase-js; providerIsolation.test.js enforces it, so swapping
 * the provider again touches the adapters and nothing else.
 */
export function getSupabaseClient(envSource = import.meta.env) {
  if (!cachedClient) {
    const { url, publishableKey } = resolveSupabaseConfig(envSource);

    cachedClient = createClient(url, publishableKey);
  }

  return cachedClient;
}

export function resetSupabaseClientForTests() {
  cachedClient = undefined;
}
