import { useEffect, useState } from "react";
import { QUEUE_CHANGED_EVENT } from "../../services/offline/submissionQueue.js";

/**
 * The reports saved on this phone and not yet accepted, kept current.
 *
 * The queue announces every change, and another tab's change arrives as a
 * storage event, so every screen showing the list agrees with the others.
 */
export default function usePendingReports(queue) {
  const [entries, setEntries] = useState(() => queue.list());

  useEffect(() => {
    const refresh = () => setEntries(queue.list());

    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [queue]);

  return entries;
}
