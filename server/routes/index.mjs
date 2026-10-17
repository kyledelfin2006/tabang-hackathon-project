import { advisoryRoutes } from "./advisories.mjs";
import { healthRoutes } from "./health.mjs";
import { incidentRoutes } from "./incidents.mjs";
import { signalRoutes } from "./signals.mjs";

// The whole /api/v1 surface. docs/api/openapi.json must list exactly these;
// tests/server/openapi.test.mjs fails when the two disagree.
export const API_ROUTES = [
  ...healthRoutes,
  ...advisoryRoutes,
  ...incidentRoutes,
  ...signalRoutes,
];
