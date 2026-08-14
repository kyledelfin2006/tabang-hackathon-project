export default function ErrorState({
  title,
  message,
  actionLabel = "Try again",
  onAction,
}) {
  return (
    <section className="feedback-card feedback-card--error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onAction ? (
        <button className="action-button action-button--secondary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
