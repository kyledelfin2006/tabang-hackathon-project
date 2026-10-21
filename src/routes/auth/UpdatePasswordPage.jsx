import { useState } from "react";
import { Link } from "react-router-dom";
import { FormStatus, PasswordField } from "../../components/forms/FormField.jsx";
import { useAuth } from "../../app/providers/useAuth.js";
import { describeAuthError } from "../../services/auth/authErrors.js";
import { MIN_PASSWORD_LENGTH } from "../../services/auth/profile.js";
import { homeRouteForRole } from "../../services/auth/roles.js";

/**
 * Where an emailed reset link lands.
 *
 * Following the link signs the person in for recovery only; this page is
 * where they choose the new password.
 */
export default function UpdatePasswordPage() {
  const { role, updatePassword } = useAuth();
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);

    const nextErrors = {};

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await updatePassword(form.password);
      setStatus({ tone: "success", message: "Your password has been changed." });
      setForm({ password: "", confirmPassword: "" });
    } catch (error) {
      setStatus({ tone: "error", message: describeAuthError(error) });
    } finally {
      setSubmitting(false);
    }
  }

  const setField = (field) => (value) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <section className="auth-panel">
      <span className="section-tag">Account recovery</span>
      <p>Choose a new password for your account.</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={status?.message} tone={status?.tone} />

        <PasswordField
          autoComplete="new-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          label="New password"
          name="password"
          onChange={setField("password")}
          value={form.password}
        />

        <PasswordField
          autoComplete="new-password"
          error={errors.confirmPassword}
          label="Confirm new password"
          name="confirmPassword"
          onChange={setField("confirmPassword")}
          value={form.confirmPassword}
        />

        <button className="action-button" disabled={submitting} type="submit">
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>

      <ul className="link-list">
        <li>
          <Link to={homeRouteForRole(role)}>Continue to Tabang</Link>
        </li>
      </ul>
    </section>
  );
}
