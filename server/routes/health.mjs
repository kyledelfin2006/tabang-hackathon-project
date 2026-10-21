import { ApiError } from "../http.mjs";

/**
 * Health check reflects whether the database answers a query (REQ-014).
 * Returns 200 with status: "ok" or 503 "unavailable" with no database details.
 */
export const healthRoutes = [
  {
    method: "GET",
    path: "/api/v1/health",
    usesStore: true,
    handler: async ({ store }) => {
      try {
        if (!store) {
          throw new ApiError(503, "unavailable", "The database is unavailable.");
        }
        if (store.ping) {
          await store.ping();
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(503, "unavailable", "The database is unavailable.");
      }

      return {
        body: { status: "ok", time: new Date().toISOString() },
      };
    },
  },
];
