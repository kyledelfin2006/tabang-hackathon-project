export default function Modal({
  open,
  title,
  description,
  confirmLabel = "Close",
  onClose,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-shell" role="presentation">
      <div
        aria-describedby="phase-modal-description"
        aria-labelledby="phase-modal-title"
        aria-modal="true"
        className="modal-shell__dialog"
        role="dialog"
      >
        <span className="feedback-card__badge">Shared modal</span>
        <h2 id="phase-modal-title">{title}</h2>
        <p id="phase-modal-description">{description}</p>
        <button className="action-button" onClick={onClose} type="button">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
