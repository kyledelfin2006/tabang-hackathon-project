import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/useAuth.js";
import {
  FormField,
  FormStatus,
} from "../../components/forms/FormField.jsx";
import ImageAttachments from "../../components/forms/ImageAttachments.jsx";
import LocationPicker from "../../components/forms/LocationPicker.jsx";
import { createReportRepository } from "../../services/reports/reportRepository.js";
import {
  FLOOD_SEVERITIES,
  HELP_NEEDS,
  validateReport,
} from "../../services/reports/reportSchemas.js";
import { createCloudinaryUploader } from "../../services/uploads/cloudinaryUploader.js";

const SEVERITY_LABELS = {
  ankle: "Ankle deep",
  knee: "Knee deep",
  waist: "Waist deep",
  chest: "Chest deep",
  "above-head": "Above head height",
};

const NEED_LABELS = {
  rescue: "Rescue or evacuation",
  medical: "Medical assistance",
  "food-water": "Food or drinking water",
  shelter: "Shelter",
  other: "Something else",
};

const EMPTY_FORM = {
  description: "",
  publicLocationLabel: "",
  contactPhone: "",
  latitude: "",
  longitude: "",
  severity: "",
  need: "",
  peopleAffected: "1",
};

export default function ReportFormPage({
  kind = "flood",
  reportRepository,
  uploader,
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const repository = useMemo(
    () => reportRepository ?? createReportRepository(),
    [reportRepository],
  );
  const imageUploader = useMemo(
    () => uploader ?? createCloudinaryUploader(),
    [uploader],
  );

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    contactPhone: profile?.phone ?? "",
    publicLocationLabel: profile?.barangay ?? "",
  }));
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // One id per form session. Retrying reuses it, so a duplicate click or a
  // resend after a timeout cannot file the same emergency twice.
  const reportIdRef = useRef(crypto.randomUUID());
  const abortRef = useRef(null);

  const setField = useCallback(
    (field) => (value) => setForm((current) => ({ ...current, [field]: value })),
    [],
  );

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setFormError(null);

    const { values, errors: fieldErrors, isValid } = validateReport(kind, form);

    setErrors(fieldErrors);

    if (!isValid) {
      return;
    }

    setSubmitting(true);
    abortRef.current = new AbortController();

    try {
      const uploaded = [];

      for (const [index, attachment] of attachments.entries()) {
        setProgress({ index: index + 1, total: attachments.length, percent: 0 });

        uploaded.push(
          await imageUploader.upload(attachment.file, {
            signal: abortRef.current.signal,
            onProgress: (percent) =>
              setProgress({
                index: index + 1,
                total: attachments.length,
                percent,
              }),
          }),
        );
      }

      await repository.submitReport({
        reportId: reportIdRef.current,
        reporterId: user.uid,
        values,
        images: uploaded,
      });

      navigate("/app/reports", { replace: true });
    } catch (error) {
      // The form keeps everything the resident typed so they can retry.
      setFormError(
        error?.message ??
          "The report could not be sent. Your details are still here — try again.",
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  const isFlood = kind === "flood";

  return (
    <section className="surface-card surface-card--wide">
      <span className="section-tag">
        {isFlood ? "Report flooding" : "Request help"}
      </span>
      <h2>{isFlood ? "Report a flood" : "Ask for assistance"}</h2>
      <p>
        {isFlood
          ? "Tell responders where the water is and how deep it has reached."
          : "Tell responders what you need and how many people are with you."}
      </p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <FormStatus message={formError} />

        {isFlood ? (
          <div className="form-field">
            <label className="form-field__label" htmlFor="severity">
              How deep is the water?
            </label>
            <select
              aria-invalid={errors.severity ? "true" : undefined}
              className="form-field__input"
              id="severity"
              onChange={(event) => setField("severity")(event.target.value)}
              value={form.severity}
            >
              <option value="">Choose a depth</option>
              {FLOOD_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABELS[severity]}
                </option>
              ))}
            </select>
            {errors.severity ? (
              <p className="form-field__error">{errors.severity}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="form-field">
              <label className="form-field__label" htmlFor="need">
                What do you need?
              </label>
              <select
                aria-invalid={errors.need ? "true" : undefined}
                className="form-field__input"
                id="need"
                onChange={(event) => setField("need")(event.target.value)}
                value={form.need}
              >
                <option value="">Choose the kind of help</option>
                {HELP_NEEDS.map((need) => (
                  <option key={need} value={need}>
                    {NEED_LABELS[need]}
                  </option>
                ))}
              </select>
              {errors.need ? (
                <p className="form-field__error">{errors.need}</p>
              ) : null}
            </div>

            <FormField
              error={errors.peopleAffected}
              inputMode="numeric"
              label="How many people need help?"
              name="peopleAffected"
              onChange={setField("peopleAffected")}
              type="number"
              value={form.peopleAffected}
            />
          </>
        )}

        <FormField
          error={errors.publicLocationLabel}
          hint="Barangay or a nearby landmark. This part may be shown publicly."
          label="Location name"
          name="publicLocationLabel"
          onChange={setField("publicLocationLabel")}
          value={form.publicLocationLabel}
        />

        <LocationPicker
          error={errors.location}
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={({ latitude, longitude }) =>
            setForm((current) => ({ ...current, latitude, longitude }))
          }
        />

        <div className="form-field">
          <label className="form-field__label" htmlFor="description">
            What is happening?
          </label>
          <textarea
            aria-invalid={errors.description ? "true" : undefined}
            className="form-field__input"
            id="description"
            onChange={(event) => setField("description")(event.target.value)}
            rows={5}
            value={form.description}
          />
          {errors.description ? (
            <p className="form-field__error">{errors.description}</p>
          ) : null}
        </div>

        <FormField
          autoComplete="tel"
          error={errors.contactPhone}
          hint="Shared only with responders handling this report."
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
