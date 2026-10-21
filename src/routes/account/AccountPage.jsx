import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import { FormField, FormStatus } from "../../components/forms/FormField.jsx";
import { validateProfileInput } from "../../services/auth/profile.js";
import { describeActionError } from "../../services/errors/describeActionError.js";

function ProfileForm({ user, profile, updateOwnProfile }) {
  const [form, setForm] = useState(() => ({
    displayName: profile?.displayName || user?.displayName || "",
    phone: profile?.phone ?? "",
    barangay: profile?.barangay ?? "",
  }));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (field) => (value) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);

    const { values, errors: fieldErrors, isValid } = validateProfileInput(form);

    setErrors(fieldErrors);

    if (!isValid) {
      return;
    }

    setSaving(true);

    try {
      await updateOwnProfile(user.uid, values);
      setForm(values);
      setStatus({ tone: "success", message: "Your details have been saved." });
    } catch (error) {
      setStatus({ tone: "error", message: describeActionError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="auth-form" noValidate onSubmit={handleSubmit}>
      <h2>Your details</h2>
      <FormStatus message={status?.message} tone={status?.tone} />

      <FormField
        autoComplete="name"
        error={errors.displayName}
        label="Full name"
        name="displayName"
        onChange={setField("displayName")}
        value={form.displayName}
      />
      <FormField
        autoComplete="tel"
        error={errors.phone}
        inputMode="tel"
        label="Mobile number"
        name="phone"
        onChange={setField("phone")}
        type="tel"
        value={form.phone}
      />
      <FormField
        error={errors.barangay}
        label="Barangay"
        name="barangay"
        onChange={setField("barangay")}
        value={form.barangay}
      />

      <div className="button-row">
        <button className="action-button" disabled={saving} type="submit">
          {saving ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}

export default function AccountPage() {
  const { user, profile, role, signOut, updateOwnProfile } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);

    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setSignOutError("Sign-out failed. Check your connection and try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section className="surface-card surface-card--wide">
      <div className="detail-list">
        <span>
          <strong>Email</strong>
          {user?.email || "Not provided"}
        </span>
        <span>
          <strong>Role</strong>
          {role}
        </span>
      </div>

      {user ? (
        <ProfileForm
          profile={profile}
          updateOwnProfile={updateOwnProfile}
          user={user}
        />
      ) : null}

      <FormStatus message={signOutError} />

      <div className="button-row">
        <button
          className="action-button"
          disabled={signingOut}
          onClick={handleSignOut}
          type="button"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}
