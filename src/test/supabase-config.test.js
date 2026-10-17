import { describe, expect, it } from "vitest";
import {
  REQUIRED_SUPABASE_ENV_KEYS,
  resolveSupabaseConfig,
} from "../config/env.js";

const validEnv = Object.freeze({
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_demo",
});

describe("resolveSupabaseConfig", () => {
  it("reads the URL and publishable key", () => {
    expect(resolveSupabaseConfig(validEnv)).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_demo",
    });
  });

  it("names every missing key", () => {
    expect(() => resolveSupabaseConfig({})).toThrow(
      "VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("rejects a URL that is not a URL", () => {
    expect(() =>
      resolveSupabaseConfig({ ...validEnv, VITE_SUPABASE_URL: "localhost" }),
    ).toThrow("VITE_SUPABASE_URL must be a full URL");
  });

  it("never asks for the secret key in the browser", () => {
    expect(REQUIRED_SUPABASE_ENV_KEYS).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect(REQUIRED_SUPABASE_ENV_KEYS.join(" ")).not.toMatch(/SECRET/);
  });
});
