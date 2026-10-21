import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { FormField, FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { createAdvisoryRepository } from "../../services/advisories/advisoryRepository.js";
import { collapseWhitespace } from "../../services/auth/profile.js";
import { describeActionError } from "../../services/errors/describeActionError.js";
import { AKLAN_MUNICIPALITIES } from "../../services/places/aklanPlaces.js";

const MAX_SUMMARY = 240;

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

/**
 * Where a responder publishes and withdraws public advisories.
 *
 * Whatever is typed here is shown to everyone, signed in or not, so the copy
 * on the form says so and nothing from a report is filled in automatically.
 */
export default function ResponderAdvisoriesPage({ advisoryRepository }) {
  const { user } = useAuth();
  const actorId = user?.uid;
  const repository = useMemo(
    () => advisoryRepository ?? createAdvisoryRepository(),
    [advisoryRepository],
  );

  const [advisories, setAdvisories] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [form, setForm] = useState({
    summary: "",
    municipality: "",
    barangay: "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [working, setWorking] = useState(false);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const items = await repository.listOwnAdvisories(actorId);

        if (activeRef.current === requestId) {
          setAdvisories(items);
          setLoadState("ready");
        }
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("error");
        }
      }
    },
    [repository, actorId],
  );

  useEffect(() => {
    activeRef.current += 1;

    if (!actorId) {
      return undefined;
    }

    load(activeRef.current);

    return () => {
      activeRef.current += 1;
    };
  }, [load, actorId]);

  const refresh = useCallback(() => {
    activeRef.current += 1;
    load(activeRef.current);
  }, [load]);

  async function publish(event) {
    event.preventDefault();
    setStatus(null);

    const summary = collapseWhitespace(form.summary);
    const nextErrors = {};

    if (summary.length < 10) {
      nextErrors.summary = "Write at least 10 characters.";
    } else if (summary.length > MAX_SUMMARY) {
      nextErrors.summary = `Keep the advisory under ${MAX_SUMMARY} characters.`;
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setWorking(true);

    try {
      await repository.publishAdvisory({
        summary,
        municipality: form.municipality,
        barangay: collapseWhitespace(form.barangay),
      });
      setForm({ summary: "", municipality: "", barangay: "" });
      setStatus({
        tone: "success",
        message: "Published. Residents can see it now.",
      });
      refresh();
    } catch (error) {
      setStatus({ tone: "error", message: describeActionError(error) });
    } finally {
      setWorking(false);
    }
  }

  async function unpublish(id) {
    setWorking(true);
    setStatus(null);

    try {
      await repository.unpublishAdvisory(id);
      setStatus({
        tone: "success",
        message: "Unpublished. Residents no longer see it.",
      });
      refresh();
    } catch (error) {
      setStatus({ tone: "error", message: describeActionError(error) });
    } finally {
      setWorking(false);
    }
  }

  const setField = (field) => (value) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <>
      <Section
        id="publish-advisory"
        title="Publish an advisory"
        description="Advisories are public: anyone opening Tabang can read them. Never include names, phone numbers, or house addresses."
      >
        <form className="auth-form" noValidate onSubmit={publish}>
          <FormStatus message={status?.message} tone={status?.tone} />

          <div className="form-field">
            <label className="form-field__label" htmlFor="advisory-summary">
              Advisory
            </label>
            <textarea
              aria-describedby={
                errors.summary ? "advisory-summary-error" : undefined
              }
              aria-invalid={errors.summary ? "true" : undefined}
              className="form-field__input"
              id="advisory-summary"
              maxLength={MAX_SUMMARY}
              onChange={(event) => setField("summary")(event.target.value)}
              rows={3}
              value={form.summary}
            />
            {errors.summary ? (
              <p className="form-field__error" id="advisory-summary-error">
                {errors.summary}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label
              className="form-field__label"
              htmlFor="advisory-municipality"
            >
              Municipality (optional)
            </label>
            <select
              className="form-field__input"
              id="advisory-municipality"
              onChange={(event) => setField("municipality")(event.target.value)}
              value={form.municipality}
            >
              <option value="">All of Aklan</option>
              {AKLAN_MUNICIPALITIES.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="Barangay (optional)"
            name="barangay"
            onChange={setField("barangay")}
            required={false}
            value={form.barangay}
          />

          <button className="action-button" disabled={working} type="submit">
            {working ? "Saving…" : "Publish advisory"}
          </button>
        </form>
      </Section>

      <Section id="my-advisories" title="Your advisories">
        {loadState === "loading" ? (
          <Skeleton label="Loading your advisories" lines={3} />
        ) : null}

        {loadState === "error" ? (
          <ErrorState
            title="Your advisories could not be loaded"
            message="Check your connection and try again."
            actionLabel="Try again"
            onAction={refresh}
          />
        ) : null}

        {loadState === "ready" && advisories.length === 0 ? (
          <EmptyState
            title="You have not published any advisories"
            message="Advisories you publish appear here, where you can also withdraw them."
          />
        ) : null}

        {loadState === "ready" && advisories.length > 0 ? (
          <ul className="report-list">
            {advisories.map((advisory) => (
              <li className="report-card" key={advisory.id}>
                <div className="report-card__meta">
                  <Badge tone={advisory.published ? "success" : "neutral"}>
                    {advisory.published ? "Published" : "Unpublished"}
                  </Badge>
                  <span>{formatWhen(advisory.createdAtMillis)}</span>
                </div>
                <p className="report-card__body">{advisory.summary}</p>
                {advisory.published ? (
                  <div className="button-row">
                    <button
                      className="action-button action-button--secondary"
                      disabled={working}
                      onClick={() => unpublish(advisory.id)}
                      type="button"
                    >
                      Unpublish
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
