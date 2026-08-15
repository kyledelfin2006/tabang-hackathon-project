/**
 * Shown when a report cannot reach the server.
 *
 * A resident whose submission just failed needs a number to ring, not an
 * apology. These are the same records the hotline directory serves, and they
 * carry the same unverified warning rather than implying they are confirmed.
 */
export default function EmergencyFallback({ hotlines = [] }) {
  return (
    <section className="feedback-card feedback-card--error" role="alert">
      <h2>Your report has not been sent</h2>
      <p>
        It is saved on this phone and will be retried, but nobody has seen it
        yet. If this is urgent, call for help directly now.
      </p>

      {hotlines.length > 0 ? (
        <ul className="link-list">
          {hotlines.map((hotline) => (
            <li key={hotline.id}>
              {hotline.organization}:{" "}
              {hotline.phoneNumbers.map((number) => (
                <a href={`tel:${encodeURIComponent(number)}`} key={number}>
                  {number}
                </a>
              ))}
              {hotline.verified ? "" : " (not yet verified)"}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Contact your barangay hall or the municipal DRRM office directly. The
          hotline directory could not be loaded on this device.
        </p>
      )}
    </section>
  );
}
