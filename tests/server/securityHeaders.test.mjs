import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSecurityHeaders } from "../../server/securityHeaders.mjs";

test("REQ-010: the browser may reach only this origin and the Supabase project", () => {
  const policy = buildSecurityHeaders({ supabaseUrl: "https://abc.supabase.co/" })[
    "Content-Security-Policy"
  ];

  assert.match(policy, /connect-src 'self' https:\/\/abc\.supabase\.co;/);
  assert.match(policy, /img-src 'self' data: blob: https:\/\/abc\.supabase\.co;/);
  assert.doesNotMatch(policy, /firebase|googleapis|cloudinary/);
});

test("without a configured project the policy allows this origin alone", () => {
  for (const supabaseUrl of [undefined, "not a url"]) {
    const policy = buildSecurityHeaders({ supabaseUrl })["Content-Security-Policy"];

    assert.match(policy, /connect-src 'self';/);
  }
});