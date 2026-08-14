export default function AppHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  actionHref,
  menu,
}) {
  return (
    <header className="app-header">
      {menu ? (
        <button
          aria-controls={menu.controls}
          aria-expanded={menu.expanded}
          className="app-header__menu"
          onClick={menu.onOpen}
          type="button"
        >
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">{menu.label}</span>
        </button>
      ) : null}
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
