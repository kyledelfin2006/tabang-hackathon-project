import { createReadStream } from "node:fs";
import { extname } from "node:path";
import { ApiError } from "../http.mjs";
import { getSession, mapDatabaseError, requireSession } from "./auth.mjs";
import {
  EXT_TO_MIME,
  isSafeSegment,
  resolveFilePath,
  writeIdentityEvidence,
  writeReportPhoto,
} from "../files.mjs";

export const FILE_ROUTES = [
  {
    method: "POST",
    path: "/api/app/files/report-photos/{reportId}",
    isUpload: true,
    maxBodyBytes: 5 * 1024 * 1024,
    handler: async ({ req, params, body, store, env }) => {
      const session = await requireSession(req, store);

      if (!isSafeSegment(params.reportId)) {
        throw new ApiError(400, "invalid_request", "Invalid report id.");
      }

      // If report already exists in database, verify reporter ownership
      const existingReporterId = await store.getReportReporterId(params.reportId);
      if (existingReporterId && existingReporterId !== session.user.id) {
        throw new ApiError(403, "forbidden", "You cannot upload photos to another user's report.");
      }

      try {
        const contentType = String(req.headers["content-type"] || "");
        const result = writeReportPhoto({
          reporterId: session.user.id,
          reportId: params.reportId,
          buffer: body,
          contentType,
          env,
        });

        return {
          status: 200,
          body: { path: result.path },
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "POST",
    path: "/api/app/files/identity-evidence",
    isUpload: true,
    maxBodyBytes: 5 * 1024 * 1024,
    handler: async ({ req, body, store, env }) => {
      const session = await requireSession(req, store);

      try {
        const contentType = String(req.headers["content-type"] || "");
        const result = writeIdentityEvidence({
          applicantId: session.user.id,
          buffer: body,
          contentType,
          env,
        });

        return {
          status: 200,
          body: { path: result.path },
        };
      } catch (err) {
        throw mapDatabaseError(err);
      }
    },
  },
  {
    method: "GET",
    path: "/api/app/files/report-photos/{reporterId}/{reportId}/{filename}",
    handler: async ({ req, params, store, env }) => {
      const session = await getSession(req, store);
      if (!session) {
        throw new ApiError(404, "not_found", "Photo not found.");
      }

      const role = session.role || session.user?.role || "resident";
      const isReporter = session.user.id === params.reporterId;
      const isResponderOrAbove = ["responder", "reviewer", "admin"].includes(role);

      if (!isReporter && !isResponderOrAbove) {
        throw new ApiError(404, "not_found", "Photo not found.");
      }

      const filePath = resolveFilePath({
        kind: "report-photos",
        parts: [params.reporterId, params.reportId, params.filename],
        env,
      });

      if (!filePath) {
        throw new ApiError(404, "not_found", "Photo not found.");
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = EXT_TO_MIME[ext] || "application/octet-stream";

      return {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
        stream: createReadStream(filePath),
      };
    },
  },
  {
    method: "GET",
    path: "/api/app/files/identity-evidence/{applicantId}/{filename}",
    handler: async ({ req, params, store, env }) => {
      const session = await getSession(req, store);
      if (!session) {
        throw new ApiError(404, "not_found", "Evidence not found.");
      }

      const role = session.role || session.user?.role || "resident";
      const isApplicant = session.user.id === params.applicantId;
      const isReviewerOrAbove = ["reviewer", "admin"].includes(role);

      if (!isApplicant && !isReviewerOrAbove) {
        throw new ApiError(404, "not_found", "Evidence not found.");
      }

      const filePath = resolveFilePath({
        kind: "identity-evidence",
        parts: [params.applicantId, params.filename],
        env,
      });

      if (!filePath) {
        throw new ApiError(404, "not_found", "Evidence not found.");
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = EXT_TO_MIME[ext] || "application/octet-stream";

      return {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
        stream: createReadStream(filePath),
      };
    },
  },
];
