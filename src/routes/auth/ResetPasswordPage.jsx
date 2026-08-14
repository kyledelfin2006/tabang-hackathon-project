import { useState } from "react";
import { Link } from "react-router-dom";
import { FormField, FormStatus } from "../../components/forms/FormField.jsx";
import { useAuth } from "../../app/providers/useAuth.js";
import { PASSWORD_RESET_ACKNOWLEDGEMENT } from "../../services/auth/authErrors.js";
import { validateEmailOnlyInput } from "../../services/auth/profile.js";

export default function ResetPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState(undefined);
  const [acknowledgement, setAcknowledgement] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setAcknowledgement(null);

    const { values, errors, isValid } = validateEmailOnlyInput({ email });

    setFieldError(errors.email);

    if (!isValid) {
      return;
    }

    setSubmitting(true);

    try {
      await sendPasswordReset(values.email);
    } catch {
      // Deliberately swallowed. Reporting the failure would reveal whether the
      // address is registered.
    } finally {
      setSubmitting(false);
      setAcknowledgement(PASSWORD_RESET_ACKNOWLEDGEMENT);
    }
  }

  return (
    <section className="auth-panel">
      <span className="section-tag">Account recovery</span>
      <h2>Reset your password</h2>
      <p>We will email a reset link if the address has an account.</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={acknowledgement} tone="success" />

        <FormField
          autoComplete="email"
          error={fieldError}
          inputMode="email"
          label="Email address"
          name="email"
          onChange={setEmail}
          type="email"
          value={email}
        />

        <button className="action-button" disabled={submitting} type="submit">
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <ul className="link-list">
        <li>
          <Link to="/login">Back to sign in</Link>
        </li>
      </ul>
    </section>
  );
}
