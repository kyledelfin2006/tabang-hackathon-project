export default function EmptyState({ title, message }) {
  return (
    <section className="feedback-card feedback-card--empty">
      <span className="feedback-card__badge">Empty state</span>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
