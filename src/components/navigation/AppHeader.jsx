import { Link } from "react-router-dom";

export default function AppHeader({ menu }) {
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
      <Link aria-label="Tabang home" className="app-header__brand" to="/">
        <img alt="Tabang logo" src="/images/tabang-logo.png" />
        <span>Tabang</span>
      </Link>
    </header>
  );
}
