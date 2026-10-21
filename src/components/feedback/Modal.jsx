import { useEffect, useId, useRef } from "react";

export default function Modal({
  open,
  title,
  description,
  confirmLabel = "Close",
  onClose,
  onConfirm,
  dismissLabel = "Go back",
  children,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

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
    <div
      className="modal-shell"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();

          return;
        }

        // Keep Tab inside the dialog, so focus never lands on the page
        // behind it while it is open.
        if (event.key === "Tab") {
          const focusable = [
            ...dialogRef.current.querySelectorAll(
              "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
            ),
          ].filter((element) => !element.disabled);
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-shell__dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children}
        <div className="button-row">
          {/* When a confirm action exists, dismissing must never perform it. */}
          {onConfirm ? (
            <button
              className="action-button action-button--secondary"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              {dismissLabel}
            </button>
          ) : null}
          <button
            className="action-button"
            onClick={onConfirm ?? onClose}
            ref={onConfirm ? undefined : closeButtonRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
