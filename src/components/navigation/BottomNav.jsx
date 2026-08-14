import { NavLink } from "react-router-dom";

export default function BottomNav({ items }) {
  return (
    <nav className="bottom-nav-shell" aria-label="Primary route navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          // Parent routes must not stay highlighted on their child routes.
          end={item.end ?? true}
          className={({ isActive }) =>
            isActive
              ? "bottom-nav-shell__item is-active"
              : "bottom-nav-shell__item"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
