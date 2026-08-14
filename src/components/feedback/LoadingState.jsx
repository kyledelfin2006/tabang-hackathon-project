export default function LoadingState({ title, message }) {
  return (
    <section className="feedback-card feedback-card--loading" aria-live="polite">
      <span className="feedback-card__badge">Loading</span>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="loading-bar" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}
