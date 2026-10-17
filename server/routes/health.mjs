/** Liveness only: answers without touching the database. */
export const healthRoutes = [
  {
    method: "GET",
    path: "/api/v1/health",
    handler: () => ({
      body: { status: "ok", time: new Date().toISOString() },
    }),
  },
];
