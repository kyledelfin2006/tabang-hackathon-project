import { Link } from "react-router-dom";

export function Card({ children, className = "", as: Element = "article" }) {
  return (
    <Element className={`surface-card ${className}`.trim()}>{children}</Element>
  );
}

export function Section({ title, description, action, children, id }) {
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <section aria-labelledby={headingId} className="stack-section">
      <div className="section-label">
        <div>
          <h3 id={headingId}>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

const BADGE_TONES = new Set(["neutral", "info", "success", "warning", "danger"]);

export function Badge({ tone = "neutral", children }) {
  const safeTone = BADGE_TONES.has(tone) ? tone : "neutral";

  return <span className={`badge badge--${safeTone}`}>{children}</span>;
}

export function ActionLink({ to, children, variant = "primary", ...rest }) {
  const className =
    variant === "secondary"
      ? "action-button action-button--secondary"
      : "action-button";

  return (
    <Link className={className} to={to} {...rest}>
      {children}
    </Link>
  );
}

/**
 * A shared skeleton so every route shows the same loading shape instead of a
 * bespoke spinner per page.
 */
export function Skeleton({ lines = 3, label = "Loading content" }) {
  return (
    <div aria-busy="true" aria-label={label} className="skeleton" role="status">
      {Array.from({ length: lines }, (_, index) => (
        <span className="skeleton__line" key={index} />
      ))}
    </div>
  );
}
