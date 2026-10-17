import { Link } from "react-router-dom";

export default function EmergencyCallCard() {
  return (
    <section aria-labelledby="emergency-call-title" className="surface-card">
      <h2 id="emergency-call-title">Need emergency help?</h2>
      <p>Call the national emergency line or contact your barangay hall.</p>
      <div className="button-row">
        <a className="action-button" href="tel:911">
          Call 911 now
        </a>
        <Link className="action-button action-button--secondary" to="/hotlines">
          View emergency hotlines
        </Link>
      </div>
    </section>
  );
}
