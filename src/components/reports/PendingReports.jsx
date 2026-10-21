import { useState } from "react";
import { FormStatus } from "../forms/FormField.jsx";
import { describeActionError } from "../../services/errors/describeActionError.js";
import {
  SUBMISSION_STATE,
  SUBMISSION_STATE_COPY,
} from "../../services/offline/submissionQueue.js";
import usePendingReports from "./usePendingReports.js";

function describeEntry(entry) {
  const place = entry.values?.publicLocationLabel || "Location not recorded";

  return entry.kind === "help"
    ? `Help request, ${place}`
    : `Flood report, ${place}`;
}

/**
 * Reports saved on this phone that the database has not accepted yet.
 *
 * Each can be sent now or discarded. Photos are not kept on the phone, so a
 * resend carries the words only. Nothing here says "sent" until the database
 * has accepted the report.
 */
export default function PendingReports({ queue, repository }) {
  const entries = usePendingReports(queue);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  if (entries.length === 0) {
    return null;
  }

  async function sendNow(entry) {
    setBusyId(entry.reportId);
    setError(null);

    try {
      await repository.submitReport({
        reportId: entry.reportId,
        values: entry.values,
        images: [],
      });
      queue.remove(entry.reportId);
    } catch (sendError) {
      queue.recordFailure(entry.reportId, "unknown");
      setError(describeActionError(sendError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="pending-reports-title" className="feedback-card">
      <h2 id="pending-reports-title">Saved on this phone, not sent yet</h2>
      <p>
        {SUBMISSION_STATE_COPY[SUBMISSION_STATE.savedLocally]} Photos are not
        resent.
      </p>

      <FormStatus message={error} />

      <ul className="report-list">
        {entries.map((entry) => (
          <li className="report-card" key={entry.reportId}>
            <h3 className="report-card__title">{describeEntry(entry)}</h3>
            <p className="report-card__time">
              Saved{" "}
              {entry.queuedAtMillis
                ? new Date(entry.queuedAtMillis).toLocaleString()
                : ""}
              {entry.attempts
                ? `, ${entry.attempts} failed attempt${entry.attempts === 1 ? "" : "s"}`
                : ""}
            </p>
            <div className="button-row">
              <button
                className="action-button"
                disabled={busyId !== null}
                onClick={() => sendNow(entry)}
                type="button"
              >
                {busyId === entry.reportId ? "Sending…" : "Send now"}
              </button>
              <button
                className="action-button action-button--secondary"
                disabled={busyId !== null}
                onClick={() => queue.discard(entry.reportId)}
                type="button"
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
