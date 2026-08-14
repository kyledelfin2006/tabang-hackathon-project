export default function AppHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  actionHref,
}) {
  return (
    <header className="app-header">
      <div className="app-header__copy">
        <span className="app-header__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actionLabel && actionHref ? (
        <a className="ghost-link" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </header>
  );
}
