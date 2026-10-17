import { healthRoutes } from "./health.mjs";

// The whole /api/v1 surface. docs/api/openapi.json must list exactly these;
// tests/server/openapi.test.mjs fails when the two disagree.
export const API_ROUTES = [...healthRoutes];
