import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSecurityHeaders } from "../../server/securityHeaders.mjs";

test("REQ-012: the browser may reach only this origin", () => {
  const policy = buildSecurityHeaders()["Content-Security-Policy"];

  assert.match(policy, /connect-src 'self';/);
  assert.match(policy, /img-src 'self' blob: data:;/);
  assert.doesNotMatch(policy, /supabase|firebase|googleapis|cloudinary/);
});
