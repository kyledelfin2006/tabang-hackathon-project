import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FormField,
  FormStatus,
  PasswordField,
} from "../../components/forms/FormField.jsx";
import { useAuth } from "../../app/providers/useAuth.js";
import { describeAuthError } from "../../services/auth/authErrors.js";
import { validateLoginInput } from "../../services/auth/profile.js";

export default function LoginPage() {
  const { signIn } = useAuth();
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
      setFormError(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
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
