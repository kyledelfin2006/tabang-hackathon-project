import { decodeCursor, pageOf, parseLimit } from "../paging.mjs";

function toPublicAdvisory(item) {
  return {
    id: item.id,
    kind: item.kind,
    summary: item.summary,
    municipality: item.municipality ?? null,
    barangay: item.barangay ?? null,
    source: item.source,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt ?? null,
  };
}

export const advisoryRoutes = [
  {
    method: "GET",
    path: "/api/v1/advisories",
    // Public and readable from any website: advisories are already public in
    // the app, and an uptime check calling this keeps the database awake.
    cors: true,
    usesStore: true,
    async handler({ query, store }) {
      const limit = parseLimit(query);
      const items = await store.listPublicAdvisories({
        after: decodeCursor(query),
        limit: limit + 1,
      });
      const { page, nextCursor } = pageOf(items, limit, (item) => [
        item.createdAt,
        item.id,
      ]);

      return { body: { data: page.map(toPublicAdvisory), nextCursor } };
    },
  },
];
