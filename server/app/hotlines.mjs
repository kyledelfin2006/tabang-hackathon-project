import { toHotline, validateReview } from "../../src/services/hotlines/hotlineRepository.js";
import { mapDatabaseError, requireSession } from "./auth.mjs";
import { ApiError } from "../http.mjs";

export const HOTLINE_ROUTES = [
  {
    method: "GET",
    path: "/api/app/hotlines",
    handler: async ({ store, now }) => {
      try {
        const rows = await store.listHotlines({ limit: 50 });
        const currentTime = now ? now() : Date.now();
        const hotlines = rows.map((r) =>
          toHotline(
            r.id,
            {
              organization: r.organization,
              coverageArea: r.coverageArea,
              phoneNumbers: r.phoneNumbers,
              verified: r.verified,
              verifiedAtMillis: r.verifiedAt ? Date.parse(r.verifiedAt) : null,
              verifiedBy: r.verifiedBy,
              ratingCount: r.ratingCount,
              ratingTotal: r.ratingTotal,
            },
            currentTime,
          ),
        );

        return { status: 200, body: hotlines };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/hotlines/{id}/review",
    handler: async ({ req, params, store }) => {
      const session = await requireSession(req, store);

      try {
        const review = await store.getHotlineReview(params.id, session.user.id);
        return {
          status: 200,
          body: review ? { rating: review.rating, comment: review.comment || "" } : null,
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "PUT",
    path: "/api/app/hotlines/{id}/review",
    handler: async ({ req, params, body, store }) => {
      const session = await requireSession(req, store);

      const { values, errors, isValid } = validateReview(body || {});
      if (!isValid) {
        const firstMessage = Object.values(errors)[0] || "Invalid review.";
        throw new ApiError(400, "invalid_request", firstMessage);
      }

      try {
        await store.upsertHotlineReview(session.user.id, params.id, values.rating, values.comment);
        return { status: 200, body: { ok: true } };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
];
