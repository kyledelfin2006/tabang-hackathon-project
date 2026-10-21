import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// REQ-040: the domain modules are shared by the browser and the server, so
// they may not depend on the provider, React, the browser, or Node.
const DOMAIN_MODULES = [
  "src/services/incidents/incidentLifecycle.js",
  "src/services/reports/reportSchemas.js",
  "src/services/auth/profile.js",
  "src/services/auth/roles.js",
  "src/services/metrics/dashboardMetrics.js",
  "src/services/observability/redact.js",
  "src/services/places/aklanPlaces.js",
];

const FORBIDDEN = [
  /from\s+["']@supabase\//,
  /from\s+["']react/,
  /from\s+["']node:/,
  /\b(?:window|document|localStorage|navigator|process)\.[A-Za-z]/,
];

describe("domain purity", () => {
  it.each(DOMAIN_MODULES)("%s imports only other domain code", (file) => {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);

    for (const pattern of FORBIDDEN) {
      expect(source).not.toMatch(pattern);
    }

    for (const specifier of imports) {
      expect(specifier.startsWith(".")).toBe(true);
    }
  });
});
