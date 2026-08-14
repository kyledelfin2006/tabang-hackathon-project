import { useId, useState } from "react";

export function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  hint,
  autoComplete,
  inputMode,
  required = true,
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {hint ? (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? "true" : undefined}
        autoComplete={autoComplete}
        className="form-field__input"
        id={fieldId}
        inputMode={inputMode}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  autoComplete = "current-password",
}) {
  const fieldId = useId();
  const [revealed, setRevealed] = useState(false);
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {hint ? (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className="form-field__control">
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? "true" : undefined}
          autoComplete={autoComplete}
          className="form-field__input"
          id={fieldId}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={revealed ? "text" : "password"}
          value={value}
        />
        <button
          aria-pressed={revealed}
          className="form-field__toggle"
          onClick={() => setRevealed((current) => !current)}
          type="button"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A permanently mounted live region. Screen readers only announce reliably
 * when the region exists before its content changes, so this always renders.
 */
export function FormStatus({ message, tone = "error" }) {
  return (
    <p
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={
        message ? `form-status form-status--${tone}` : "form-status is-empty"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {message ?? ""}
    </p>
  );
}
