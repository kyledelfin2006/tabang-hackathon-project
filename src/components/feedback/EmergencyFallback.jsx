/**
 * Shown when a report cannot reach the server.
 *
 * A resident whose submission just failed needs a number to ring, not an
 * apology. 911 is always listed; the directory numbers follow when they could
 * be loaded, with the same unverified warning the directory shows.
 */
export default function EmergencyFallback({ hotlines = [] }) {
  return (
    <section className="feedback-card feedback-card--error" role="alert">
      <h2>Your report has not been sent</h2>
      <p>
        It is saved on this phone and will be retried, but nobody has seen it
        yet. If this is urgent, call for help directly now.
      </p>

      <ul className="link-list">
        <li>
          National emergency hotline: <a href="tel:911">911</a>
        </li>
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

      {hotlines.length === 0 ? (
        <p>
          You can also contact your barangay hall or the municipal DRRM office
          directly.
        </p>
      ) : null}
    </section>
  );
}
