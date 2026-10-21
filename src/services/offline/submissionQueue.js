const STORAGE_KEY = "tabang.pendingReports.v1";

// Fired on window after every change, so screens showing the queue refresh.
export const QUEUE_CHANGED_EVENT = "tabang:pending-reports-changed";

/**
 * How a submission is described to the resident.
 *
 * `submitted` means the server accepted it. Nothing else may use that word.
 * A queued report is "saved on this phone", which is true and does not imply
 * anyone has seen it - telling somebody their flood report was delivered when
 * it is sitting in local storage is the worst lie this application could tell.
 */
export const SUBMISSION_STATE = Object.freeze({
  savedLocally: "saved-locally",
  sending: "sending",
  submitted: "submitted",
  failed: "failed",
});

export const SUBMISSION_STATE_COPY = Object.freeze({
  [SUBMISSION_STATE.savedLocally]:
    "Saved on this phone. Not sent yet — nobody has seen it.",
  [SUBMISSION_STATE.sending]: "Sending now…",
  [SUBMISSION_STATE.submitted]: "Sent. Responders can see this report.",
  [SUBMISSION_STATE.failed]:
    "Could not send. Still saved on this phone, and nobody has seen it yet.",
});

function readStore(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);

    return raw ? JSON.parse(raw) : [];
  } catch {
    // Corrupt or unavailable storage must never block a submission attempt.
    return [];
  }
}

function announceChange() {
  if (typeof globalThis.dispatchEvent === "function") {
    globalThis.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  }
}

function writeStore(storage, entries) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private-mode failures are non-fatal; the caller still tries
    // to send, it just will not survive a reload.
  }

  announceChange();
}

/**
 * A queue of report submissions that failed to reach the server.
 *
 * Entries keep the report id generated when the form was opened, so a retry
 * writes to the same document and cannot file a second emergency.
 */
export function createSubmissionQueue({
  storage = globalThis.localStorage,
} = {}) {
  if (!storage) {
    // Server rendering or a locked-down browser: behave as an empty queue
    // rather than throwing during module load.
    return {
      list: () => [],
      enqueue: () => {},
      remove: () => {},
      discard: () => {},
      recordFailure: () => {},
      clear: () => {},
    };
  }

  return {
    list() {
      return readStore(storage);
    },

    /**
     * Adds or replaces an entry keyed by its report id.
     *
     * Replacing rather than appending means a resident pressing send three
     * times offline still has exactly one queued report.
     */
    enqueue(entry) {
      const existing = readStore(storage);
      const previous = existing.find(
        (queued) => queued.reportId === entry.reportId,
      );

      writeStore(storage, [
        ...existing.filter((queued) => queued.reportId !== entry.reportId),
        {
          attempts: 0,
          lastFailure: null,
          ...previous,
          ...entry,
          queuedAtMillis:
            entry.queuedAtMillis ?? previous?.queuedAtMillis ?? Date.now(),
        },
      ]);
    },

    remove(reportId) {
      writeStore(
        storage,
        readStore(storage).filter((queued) => queued.reportId !== reportId),
      );
    },

    /** The resident chose not to send this report after all. */
    discard(reportId) {
      writeStore(
        storage,
        readStore(storage).filter((queued) => queued.reportId !== reportId),
      );
    },

    /** Counts a failed send and remembers why, for the pending list. */
    recordFailure(reportId, reason) {
      writeStore(
        storage,
        readStore(storage).map((queued) =>
          queued.reportId === reportId
            ? {
                ...queued,
                attempts: (queued.attempts ?? 0) + 1,
                lastFailure: reason,
              }
            : queued,
        ),
      );
    },

    /**
     * Empties the queue.
     *
     * Called on sign-out: a queued report carries precise coordinates and a
     * contact number, and phones get shared and handed around during an
     * evacuation.
     */
    clear() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing further to do; the entries are unreadable anyway.
      }

      announceChange();
    },
  };
}

export { STORAGE_KEY };
