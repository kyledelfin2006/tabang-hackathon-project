import {
  classifyActionError,
  describeActionError,
} from "../errors/describeActionError.js";
import { validateReport } from "./reportSchemas.js";

/**
 * Sends one report: validate, queue, upload photos, insert.
 *
 * The report is queued on the phone before any network call and removed only
 * once the database has accepted it, so a failure at any step leaves something
 * to resend. A photo failure is reported separately so the resident can send
 * the words without the pictures in one action.
 */
export function createReportSubmitter({ repository, uploader, queue }) {
  return {
    async submit({
      reportId,
      reporterId,
      kind,
      form,
      attachments = [],
      skipPhotos = false,
      onProgress,
      signal,
    }) {
      const { values, errors, isValid } = validateReport(kind, form);

      if (!isValid) {
        return { status: "invalid", errors };
      }

      queue.enqueue({ reportId, kind, values });

      const images = [];

      if (!skipPhotos) {
        try {
          for (const [index, attachment] of attachments.entries()) {
            const position = { index: index + 1, total: attachments.length };

            onProgress?.({ ...position, percent: 0 });
            images.push(
              await uploader.upload(attachment.file, {
                reporterId,
                reportId,
                signal,
                onProgress: (percent) => onProgress?.({ ...position, percent }),
              }),
            );
          }
        } catch (error) {
          queue.recordFailure(reportId, "upload");

          return {
            status: "failed",
            reason: "upload",
            message: describeActionError(error),
          };
        }
      }

      try {
        await repository.submitReport({ reportId, values, images });
      } catch (error) {
        const reason = classifyActionError(error);

        queue.recordFailure(reportId, reason);

        return {
          status: "failed",
          reason,
          message: describeActionError(error),
        };
      }

      queue.remove(reportId);

      return { status: "submitted" };
    },
  };
}
