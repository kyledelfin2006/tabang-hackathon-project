import { useEffect, useRef } from "react";

/**
 * Lists every problem at the top of a form after a failed submit.
 *
 * Focus moves here so a screen reader announces the problems and a keyboard
 * user does not have to hunt for them; each item links to its field. `fields`
 * maps an error key to the id of the field it belongs to, in form order.
 * `attempt` changes on every failed submit, so focus returns here each time.
 */
export default function ErrorSummary({ errors, fields, attempt }) {
  const ref = useRef(null);
  const items = Object.entries(fields).filter(([key]) => errors[key]);

  useEffect(() => {
    if (attempt > 0) {
      ref.current?.focus();
    }
  }, [attempt]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      aria-labelledby="error-summary-title"
      className="feedback-card feedback-card--error"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <h2 id="error-summary-title">Check these before sending</h2>
      <ul className="link-list">
        {items.map(([key, fieldId]) => (
          <li key={key}>
            <a href={`#${fieldId}`}>{errors[key]}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
