import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import { FormStatus } from "../../components/forms/FormField.jsx";

export default function AccountPage({ area = "Resident route" }) {
  const { user, profile, role, signOut } = useAuth();
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
      <span className="section-tag">{area}</span>
      <h2>Account</h2>
      <p>
        Your session is resolved once, centrally, and the role below comes from
        a record only a reviewer can write.
      </p>

      <div className="detail-list">
        <span>
          <strong>Name</strong>
          {profile?.displayName || user?.displayName || "Not provided"}
        </span>
        <span>
          <strong>Email</strong>
          {user?.email || "Not provided"}
        </span>
        <span>
          <strong>Barangay</strong>
          {profile?.barangay || "Not provided"}
        </span>
        <span>
          <strong>Role</strong>
          {role}
        </span>
      </div>

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
