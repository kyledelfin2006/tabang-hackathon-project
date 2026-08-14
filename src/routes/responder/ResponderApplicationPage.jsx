import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import { FormField, FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { prepareImageForUpload } from "../../services/uploads/prepareImage.js";
import {
  APPLICATION_STATUS,
  CONSENT_VERSION,
  createApplicationRepository,
  validateApplication,
} from "../../services/responders/applicationRepository.js";

const STATUS_COPY = {
  [APPLICATION_STATUS.pending]: {
    tone: "warning",
    label: "Under review",
    message:
      "Your application is with a reviewer. You will keep resident access until it is approved. Applying does not grant responder access.",
  },
  [APPLICATION_STATUS.approved]: {
    tone: "success",
    label: "Approved",
    message:
      "Your responder access has been approved. Sign out and back in if you do not see responder routes yet.",
  },
  [APPLICATION_STATUS.rejected]: {
    tone: "danger",
    label: "Not approved",
    message:
      "A reviewer did not approve this application. Contact your organization if you believe this is a mistake.",
  },
};

export default function ResponderApplicationPage({ applicationRepository }) {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const repository = useMemo(
    () => applicationRepository ?? createApplicationRepository(),
    [applicationRepository],
  );

  const [existing, setExisting] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [form, setForm] = useState({
    organization: "",
    badgeNumber: "",
    municipality: "",
    consentAccepted: false,
  });
  const [documents, setDocuments] = useState({ identity: null, selfie: null });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const application = await repository.getMyApplication(uid);

        if (activeRef.current !== requestId) {
          return;
        }

        setExisting(application);
        setLoadState("ready");
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("ready");
        }
      }
    },
    [repository, uid],
  );

  useEffect(() => {
    activeRef.current += 1;
    load(activeRef.current);

    return () => {
      activeRef.current += 1;
    };
  }, [load]);

  const setField = (field) => (value) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function pickDocument(slot, file) {
    if (!file) {
      return;
    }

    const prepared = await prepareImageForUpload(file);

    if (!prepared.ok) {
      setErrors((current) => ({ ...current, evidence: prepared.reason }));

      return;
    }

    setErrors((current) => ({ ...current, evidence: undefined }));
    setDocuments((current) => ({ ...current, [slot]: prepared.file }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const hasEvidence = Boolean(documents.identity && documents.selfie);
    const { values, errors: fieldErrors, isValid } = validateApplication(form, {
      hasEvidence,
    });

    setErrors(fieldErrors);

    if (!isValid) {
      return;
    }

    setSubmitting(true);

    try {
      const identity = await repository.uploadEvidence(documents.identity);
      const selfie = await repository.uploadEvidence(documents.selfie);

      await repository.submitApplication({
        uid,
        values,
        evidence: {
          identityDocumentPath: identity.publicId,
          selfiePath: selfie.publicId,
        },
      });

      setExisting({ ...values, status: APPLICATION_STATUS.pending });
    } catch (error) {
      setFormError(
        error?.message ?? "The application could not be sent. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === "loading") {
    return <Skeleton label="Loading your application" lines={3} />;
  }

  if (existing) {
    const copy = STATUS_COPY[existing.status] ?? STATUS_COPY.pending;

    return (
      <Section id="application" title="Responder application">
        <div className="surface-card">
          <Badge tone={copy.tone}>{copy.label}</Badge>
          <p>{copy.message}</p>
          <div className="detail-list">
            <span>
              <strong>Organization</strong>
              {existing.organization}
            </span>
            <span>
              <strong>Municipality</strong>
              {existing.municipality}
            </span>
          </div>
          {existing.reviewNotes ? (
            <p>
              <strong>Reviewer notes:</strong> {existing.reviewNotes}
            </p>
          ) : null}
        </div>
      </Section>
    );
  }

  return (
    <Section
      id="application"
      title="Apply to be a responder"
      description="Submitting this does not grant responder access. A reviewer checks every application."
    >
      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={formError} />

        <div className="surface-card">
          <h4>Your verified details</h4>
          <p>
            These come from your account and are not re-entered here, so an
            application always matches the account it belongs to.
          </p>
          <div className="detail-list">
            <span>
              <strong>Name</strong>
              {profile?.displayName || user?.displayName || "Not provided"}
            </span>
            <span>
              <strong>Email</strong>
              {user?.email}
            </span>
            <span>
              <strong>Barangay</strong>
              {profile?.barangay || "Not provided"}
            </span>
          </div>
        </div>

        <FormField
          error={errors.organization}
          label="Organization"
          name="organization"
          onChange={setField("organization")}
          value={form.organization}
        />
        <FormField
          error={errors.badgeNumber}
          label="Badge or employee number"
          name="badgeNumber"
          onChange={setField("badgeNumber")}
          value={form.badgeNumber}
        />
        <FormField
          error={errors.municipality}
          label="Municipality you cover"
          name="municipality"
          onChange={setField("municipality")}
          value={form.municipality}
        />

        <fieldset className="form-fieldset">
          <legend>Identity evidence</legend>
          <p className="form-field__hint">
            A government ID and a selfie. These are uploaded privately, are
            visible only to you and a reviewer, and are deleted once a decision
            is recorded.
          </p>

          <div className="form-field">
            <label className="form-field__label" htmlFor="identity-document">
              Government ID
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="form-field__input"
              id="identity-document"
              onChange={(event) =>
                pickDocument("identity", event.target.files?.[0])
              }
              type="file"
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="identity-selfie">
              Selfie
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="form-field__input"
              id="identity-selfie"
              onChange={(event) =>
                pickDocument("selfie", event.target.files?.[0])
              }
              type="file"
            />
          </div>

          {errors.evidence ? (
            <p className="form-field__error" role="alert">
              {errors.evidence}
            </p>
          ) : null}
        </fieldset>

        <div className="form-field">
          <label className="consent-row" htmlFor="consent">
            <input
              checked={form.consentAccepted}
              id="consent"
              onChange={(event) =>
                setField("consentAccepted")(event.target.checked)
              }
              type="checkbox"
            />
            <span>
              I agree that Tabang may store and review my identity documents to
              verify responder status, under policy version {CONSENT_VERSION}.
            </span>
          </label>
          {errors.consentAccepted ? (
            <p className="form-field__error">{errors.consentAccepted}</p>
          ) : null}
        </div>

        <button className="action-button" disabled={submitting} type="submit">
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </Section>
  );
}
