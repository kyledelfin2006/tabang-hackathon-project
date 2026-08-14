import { useCallback, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * One accessible navigation drawer shared by every resident route.
 *
 * Replaces the per-page drawer scripts that duplicated open/close logic and
 * never trapped focus. Closing restores focus to the control that opened it.
 */
export default function NavDrawer({
  open,
  onClose,
  title,
  items,
  footer,
  labelledBy,
  id,
}) {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = panelRef.current?.querySelectorAll(FOCUSABLE) ?? [];

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previousFocusRef.current = document.activeElement;
    const firstFocusable = panelRef.current?.querySelector(FOCUSABLE);

    firstFocusable?.focus();

    return () => {
      const previous = previousFocusRef.current;

      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="drawer-root">
      {/* Presentational: keyboard users close with Escape or the close button. */}
      <div className="drawer-overlay" onClick={onClose} role="presentation" />
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="drawer-panel"
        id={id}
        onKeyDown={handleKeyDown}
        ref={panelRef}
        role="dialog"
      >
        <div className="drawer-panel__header">
          <h2 id={labelledBy}>{title}</h2>
          <button
            className="drawer-panel__close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <nav aria-label="Drawer navigation" className="drawer-panel__nav">
          {items.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "drawer-link is-active" : "drawer-link"
              }
              end={item.end}
              key={item.to}
              onClick={onClose}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {footer ? <div className="drawer-panel__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
