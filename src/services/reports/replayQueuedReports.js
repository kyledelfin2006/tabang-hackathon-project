import { classifyActionError } from "../errors/describeActionError.js";

/**
 * Resends reports saved on this phone, oldest first, without their photos.
 *
 * Each entry keeps the id from its form session, so a resend that the
 * database already accepted is a no-op rather than a second report. Replay
 * stops at the first network failure, because the rest would fail the same
 * way; any other failure is recorded and the next entry is tried.
 */
export async function replayQueuedReports({ queue, repository, reporterId }) {
  const sent = [];

  if (!reporterId) {
    return { sent, remaining: queue.list() };
  }

  const entries = [...queue.list()].sort(
    (first, second) =>
      (first.queuedAtMillis ?? 0) - (second.queuedAtMillis ?? 0),
  );

  for (const entry of entries) {
    try {
      await repository.submitReport({
        reportId: entry.reportId,
        values: entry.values,
        images: [],
      });
      queue.remove(entry.reportId);
      sent.push(entry.reportId);
    } catch (error) {
      const reason = classifyActionError(error);

      queue.recordFailure(entry.reportId, reason);

      if (reason === "network") {
        break;
      }
    }
  }

  return { sent, remaining: queue.list() };
}
