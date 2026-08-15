import { useEffect, useState } from "react";

/**
 * Tells the resident the device is offline before they type a report.
 *
 * `navigator.onLine` only proves the device has a network interface, not that
 * anything is reachable, so the wording avoids promising that being online
 * means a submission will succeed.
 */
export default function ConnectivityBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <p className="stale-notice" role="status">
      This phone is offline. You can still write a report and it will be saved
      here, but it will not reach responders until the connection returns. For
      anything urgent, call for help directly.
    </p>
  );
}
