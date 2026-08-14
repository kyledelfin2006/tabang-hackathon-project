import { NavLink } from "react-router-dom";

export default function BottomNav({ items }) {
  return (
    <nav className="bottom-nav-shell" aria-label="Primary route navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/app" || item.to === "/responder"}
          className={({ isActive }) =>
            isActive ? "bottom-nav-shell__item is-active" : "bottom-nav-shell__item"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
