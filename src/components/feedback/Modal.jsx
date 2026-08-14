import { useEffect, useId, useRef } from "react";

export default function Modal({
  open,
  title,
  description,
  confirmLabel = "Close",
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef(null);
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
        }
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-shell__dialog"
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <button
          className="action-button"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
