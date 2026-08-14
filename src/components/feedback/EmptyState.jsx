export default function EmptyState({ title, message }) {
  return (
    <section className="feedback-card feedback-card--empty">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
