import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FormField,
  FormStatus,
  PasswordField,
} from "../../components/forms/FormField.jsx";
import { useAuth } from "../../app/providers/useAuth.js";
import { describeAuthError } from "../../services/auth/authErrors.js";
import {
  MIN_PASSWORD_LENGTH,
  validateSignupInput,
} from "../../services/auth/profile.js";

const EMPTY_FORM = {
  displayName: "",
  email: "",
  phone: "",
  barangay: "",
  password: "",
  confirmPassword: "",
};

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const { values, errors: fieldErrors, isValid } = validateSignupInput(form);

    setErrors(fieldErrors);

    if (!isValid) {
      return;
    }

    setSubmitting(true);

    try {
      // Registration always creates a resident. Responder access is granted
      // only by a reviewer writing roleAssignments/{uid}.
      await register({
        displayName: values.displayName,
        email: values.email,
        phone: values.phone,
        barangay: values.barangay,
        password: values.password,
      });
      navigate("/app", { replace: true });
    } catch (error) {
      setFormError(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="section-tag">Resident registration</span>
      <h2>Create a resident account</h2>
      <p>
        Residents can report flooding and request help. Responder access is
        reviewed separately after you sign in.
      </p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={formError} />

        <FormField
          autoComplete="name"
          error={errors.displayName}
          label="Full name"
          name="displayName"
          onChange={setField("displayName")}
          value={form.displayName}
        />

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

        <FormField
          autoComplete="tel"
          error={errors.phone}
          hint="Used only so responders can reach you about your own reports."
          inputMode="tel"
          label="Mobile number"
          name="phone"
          onChange={setField("phone")}
          type="tel"
          value={form.phone}
        />

        <FormField
          autoComplete="address-level3"
          error={errors.barangay}
          label="Barangay"
          name="barangay"
          onChange={setField("barangay")}
          value={form.barangay}
        />

        <PasswordField
          autoComplete="new-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          label="Password"
          name="password"
          onChange={setField("password")}
          value={form.password}
        />

        <PasswordField
          autoComplete="new-password"
          error={errors.confirmPassword}
          label="Confirm password"
          name="confirmPassword"
          onChange={setField("confirmPassword")}
          value={form.confirmPassword}
        />

        <button className="action-button" disabled={submitting} type="submit">
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <ul className="link-list">
        <li>
          <Link to="/login">Already registered? Sign in</Link>
        </li>
        <li>
          <Link to="/privacy">How your data is handled</Link>
        </li>
      </ul>
    </section>
  );
}
