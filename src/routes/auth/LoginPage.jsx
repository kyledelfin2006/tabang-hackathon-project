import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FormField,
  FormStatus,
  PasswordField,
} from "../../components/forms/FormField.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { useAuth } from "../../app/providers/useAuth.js";
import {
  describeAuthError,
  describeAuthErrorForDiagnostics,
} from "../../services/auth/authErrors.js";
import { validateLoginInput } from "../../services/auth/profile.js";

export default function LoginPage() {
  const { signIn, initializationError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const { values, errors: fieldErrors, isValid } = validateLoginInput(form);

    setErrors(fieldErrors);

    if (!isValid) {
      return;
    }

    setSubmitting(true);

    try {
      await signIn(values);
      // The session listener resolves the trusted role; redirecting to the
      // requested route (or the role home) happens through the guards.
      navigate(location.state?.from ?? "/app", { replace: true });
    } catch (error) {
      // The code goes to the console so a failure is diagnosable without
      // asking the person to guess. It carries no personal data.
      console.error(describeAuthErrorForDiagnostics(error));
      setFormError(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * A form that cannot possibly work should not be offered.
   *
   * When Firebase has no configuration every submission fails identically,
   * and the person is left retyping a password that was never wrong. Saying
   * so up front is more honest than letting them find out one attempt at a
   * time.
   */
  if (initializationError) {
    return (
      <section className="auth-panel">
        <ErrorState
          title="Sign-in is unavailable"
          message="This site is not configured to sign in right now. This is a fault on our side, not a problem with your details or your connection. In an emergency, call the hotline numbers directly rather than waiting for this."
        />
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <span className="section-tag">Resident access</span>
      <h2>Sign in to Tabang</h2>
      <p>Use the email address you registered with.</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={formError} />

        <FormField
          autoComplete="email"
          error={errors.email}
          inputMode="email"
          label="Email address"
          name="email"
          onChange={setField("email")}
          type="email"
          value={form.email}
        />

        <PasswordField
          autoComplete="current-password"
          error={errors.password}
          label="Password"
          name="password"
          onChange={setField("password")}
          value={form.password}
        />

        <button className="action-button" disabled={submitting} type="submit">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <ul className="link-list">
        <li>
          <Link to="/reset-password">Forgot your password?</Link>
        </li>
        <li>
          <Link to="/signup">Create a resident account</Link>
        </li>
        <li>
          <Link to="/privacy">Read the privacy policy</Link>
        </li>
      </ul>
    </section>
  );
}
