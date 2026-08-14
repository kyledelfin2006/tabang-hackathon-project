export default function LoadingState({ title, message }) {
  return (
    <section className="feedback-card feedback-card--loading" aria-live="polite">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="loading-bar" aria-hidden="true">
        <span />
      </div>
    </section>
  );
}
