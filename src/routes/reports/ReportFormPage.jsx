import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import { FormField } from "../../components/forms/FormField.jsx";
import ConnectivityBanner from "../../components/feedback/ConnectivityBanner.jsx";
import EmergencyFallback from "../../components/feedback/EmergencyFallback.jsx";
import ErrorSummary from "../../components/forms/ErrorSummary.jsx";
import ImageAttachments from "../../components/forms/ImageAttachments.jsx";
import LocationPicker from "../../components/forms/LocationPicker.jsx";
import PlacePicker from "../../components/forms/PlacePicker.jsx";
import { createHotlineRepository } from "../../services/hotlines/hotlineRepository.js";
import { createReportRepository } from "../../services/reports/reportRepository.js";
import {
  FLOOD_SEVERITIES,
  HELP_NEEDS,
  NEED_LABELS,
  SEVERITY_LABELS,
} from "../../services/reports/reportSchemas.js";
import { createReportSubmitter } from "../../services/reports/submitReport.js";
import { createStorageUploader } from "../../services/uploads/storageUploader.js";
import {
  SUBMISSION_STATE,
  SUBMISSION_STATE_COPY,
  createSubmissionQueue,
} from "../../services/offline/submissionQueue.js";

const EMPTY_FORM = {
  description: "",
  municipality: "",
  barangay: "",
  landmark: "",
  contactPhone: "",
  latitude: "",
  longitude: "",
  severity: "",
  need: "",
  peopleAffected: "1",
};

// Error key to field id, in the order the fields appear.
const FIELD_IDS = Object.freeze({
  severity: "report-severity",
  need: "report-need",
  peopleAffected: "report-people",
  municipality: "report-municipality",
  barangay: "report-barangay",
  landmark: "report-landmark",
  location: "report-location",
  description: "report-description",
  contactPhone: "report-phone",
});

function SelectField({ id, label, error, value, onChange, children }) {
  const errorId = `${id}-error`;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        className="form-field__input"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      {error ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ReportFormPage({
  kind = "flood",
  reportRepository,
  uploader,
  submissionQueue,
  hotlineRepository,
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const submitter = useMemo(
    () =>
      createReportSubmitter({
        repository: reportRepository ?? createReportRepository(),
        uploader: uploader ?? createStorageUploader(),
        queue: submissionQueue ?? createSubmissionQueue(),
      }),
    [reportRepository, uploader, submissionQueue],
  );
  const hotlines = useMemo(
    () => hotlineRepository ?? createHotlineRepository(),
    [hotlineRepository],
  );

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    contactPhone: profile?.phone ?? "",
  }));
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [failure, setFailure] = useState(null);
  const [fallbackHotlines, setFallbackHotlines] = useState([]);
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionState, setSubmissionState] = useState(null);

  // One id per form session. Retrying reuses it, so a duplicate click or a
  // resend after a timeout cannot file the same emergency twice.
  const reportIdRef = useRef(crypto.randomUUID());
  const abortRef = useRef(null);

  const setField = useCallback(
    (field) => (value) =>
      setForm((current) => ({ ...current, [field]: value })),
    [],
  );

  async function loadFallbackHotlines() {
    try {
      setFallbackHotlines(await hotlines.listHotlines());
    } catch {
      // 911 and the barangay guidance still show.
      setFallbackHotlines([]);
    }
  }

  async function send({ skipPhotos = false } = {}) {
    if (submitting) {
      return;
    }

    setFailure(null);
    setSubmitting(true);
    setSubmissionState(SUBMISSION_STATE.sending);
    abortRef.current = new AbortController();

    try {
      const result = await submitter.submit({
        reportId: reportIdRef.current,
        reporterId: user.uid,
        kind,
        form,
        attachments,
        skipPhotos,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });

      if (result.status === "invalid") {
        setSubmissionState(null);
        setErrors(result.errors);
        setFailedAttempts((count) => count + 1);

        return;
      }

      setErrors({});

      if (result.status === "submitted") {
        // Only now may this be called sent: the database accepted it.
        setSubmissionState(SUBMISSION_STATE.submitted);
        navigate("/app/reports", { replace: true });

        return;
      }

      // The form keeps everything the resident typed so they can retry, and
      // the entry stays queued. The wording never claims delivery.
      setSubmissionState(SUBMISSION_STATE.failed);
      setFailure(result);

      if (result.reason !== "upload") {
        await loadFallbackHotlines();
      }
    } finally {
      setSubmitting(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    send();
  }

  const isFlood = kind === "flood";

  return (
    <section className="surface-card surface-card--wide">
      <span className="section-tag">
        {isFlood ? "Report flooding" : "Request help"}
      </span>
      <p>
        {isFlood
          ? "Tell responders where the water is and how deep it has reached."
          : "Tell responders what you need and how many people are with you."}
      </p>

      <ConnectivityBanner />

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <ErrorSummary
          attempt={failedAttempts}
          errors={errors}
          fields={FIELD_IDS}
        />

        {submissionState ? (
          <p aria-live="polite" className="form-field__hint">
            {SUBMISSION_STATE_COPY[submissionState]}
          </p>
        ) : null}

        {failure?.reason === "upload" ? (
          <section className="feedback-card feedback-card--error" role="alert">
            <h2>The photos could not be uploaded</h2>
            <p>
              {failure.message} Your report is saved on this phone. You can send
              it now without the photos.
            </p>
            <div className="button-row">
              <button
                className="action-button"
                disabled={submitting}
                onClick={() => send({ skipPhotos: true })}
                type="button"
              >
                Send without photos
              </button>
            </div>
          </section>
        ) : null}

        {failure && failure.reason !== "upload" ? (
          <>
            <p className="form-field__error" role="status">
              {failure.message}
            </p>
            <EmergencyFallback hotlines={fallbackHotlines} />
          </>
        ) : null}

        {isFlood ? (
          <SelectField
            error={errors.severity}
            id={FIELD_IDS.severity}
            label="How deep is the water?"
            onChange={setField("severity")}
            value={form.severity}
          >
            <option value="">Choose a depth</option>
            {FLOOD_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </SelectField>
        ) : (
          <>
            <SelectField
              error={errors.need}
              id={FIELD_IDS.need}
              label="What do you need?"
              onChange={setField("need")}
              value={form.need}
            >
              <option value="">Choose the kind of help</option>
              {HELP_NEEDS.map((need) => (
                <option key={need} value={need}>
                  {NEED_LABELS[need]}
                </option>
              ))}
            </SelectField>

            <FormField
              error={errors.peopleAffected}
              id={FIELD_IDS.peopleAffected}
              inputMode="numeric"
              label="How many people need help?"
              name="peopleAffected"
              onChange={setField("peopleAffected")}
              type="number"
              value={form.peopleAffected}
            />
          </>
        )}

        <PlacePicker
          errors={errors}
          ids={FIELD_IDS}
          onChange={(changes) =>
            setForm((current) => ({ ...current, ...changes }))
          }
          values={form}
        />

        <LocationPicker
          error={errors.location}
          id={FIELD_IDS.location}
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={({ latitude, longitude }) =>
            setForm((current) => ({ ...current, latitude, longitude }))
          }
        />

        <div className="form-field">
          <label className="form-field__label" htmlFor={FIELD_IDS.description}>
            What is happening?
          </label>
          <textarea
            aria-describedby={
              errors.description ? `${FIELD_IDS.description}-error` : undefined
            }
            aria-invalid={errors.description ? "true" : undefined}
            className="form-field__input"
            id={FIELD_IDS.description}
            onChange={(event) => setField("description")(event.target.value)}
            rows={5}
            value={form.description}
          />
          {errors.description ? (
            <p
              className="form-field__error"
              id={`${FIELD_IDS.description}-error`}
            >
              {errors.description}
            </p>
          ) : null}
        </div>

        <FormField
          autoComplete="tel"
          error={errors.contactPhone}
          hint="Shared only with responders handling this report."
          id={FIELD_IDS.contactPhone}
          inputMode="tel"
          label="Contact number"
          name="contactPhone"
          onChange={setField("contactPhone")}
          type="tel"
          value={form.contactPhone}
        />

        <ImageAttachments
          attachments={attachments}
          disabled={submitting}
          onChange={setAttachments}
        />

        <p aria-live="polite" className="form-field__hint">
          {progress
            ? `Uploading photo ${progress.index} of ${progress.total} (${progress.percent}%)`
            : ""}
        </p>

        <div className="button-row">
          <button className="action-button" disabled={submitting} type="submit">
            {submitting ? "Sending…" : "Send report"}
          </button>
          {submitting ? (
            <button
              className="action-button action-button--secondary"
              onClick={() => abortRef.current?.abort()}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
