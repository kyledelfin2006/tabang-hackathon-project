import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import {
  MAX_COMMENT_LENGTH,
  MAX_RATING,
  MIN_RATING,
  createHotlineRepository,
  validateReview,
} from "../../services/hotlines/hotlineRepository.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleDateString() : "Never";
}

function HotlineCard({ hotline, canReview, onReview, submitting }) {
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState({});

  function submit(event) {
    event.preventDefault();

    const result = validateReview({ rating, comment });

    setErrors(result.errors);

    if (result.isValid) {
      onReview(hotline, result.values);
    }
  }

  return (
    <li className="report-card">
      <div className="report-card__meta">
        {hotline.verified ? (
          <Badge tone="success">Verified</Badge>
        ) : (
          <Badge tone="warning">Not yet verified</Badge>
        )}
        {hotline.verificationStale ? (
          <Badge tone="warning">Verification is old</Badge>
        ) : null}
        {hotline.averageRating !== null ? (
          <span>
            {hotline.averageRating} from {hotline.ratingCount}{" "}
            {hotline.ratingCount === 1 ? "rating" : "ratings"}
          </span>
        ) : (
          <span>No ratings yet</span>
        )}
      </div>

      <h4 className="report-card__title">{hotline.organization}</h4>
      {hotline.coverageArea ? <p>Covers {hotline.coverageArea}</p> : null}

      <ul className="link-list">
        {hotline.phoneNumbers.map((number) => (
          <li key={number}>
            {/* Anyone may call, signed in or not. */}
            <a href={`tel:${encodeURIComponent(number)}`}>{number}</a>
          </li>
        ))}
      </ul>

      <p className="report-card__time">
        {hotline.verified
          ? `Last verified ${formatWhen(hotline.verifiedAtMillis)}${
              hotline.verifiedBy ? ` by ${hotline.verifiedBy}` : ""
            }`
          : "Nobody has verified this number yet. Confirm it with your barangay if you can."}
      </p>

      {canReview ? (
        <form className="auth-form" noValidate onSubmit={submit}>
          <div className="form-field">
            <label className="form-field__label" htmlFor={`rating-${hotline.id}`}>
              Did this number help?
            </label>
            <select
              className="form-field__input"
              id={`rating-${hotline.id}`}
              onChange={(event) => setRating(event.target.value)}
              value={rating}
            >
              <option value="">Choose a rating</option>
              {Array.from(
                { length: MAX_RATING - MIN_RATING + 1 },
                (_, index) => MIN_RATING + index,
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {errors.rating ? (
              <p className="form-field__error">{errors.rating}</p>
            ) : null}
          </div>

          <div className="form-field">
            <label
              className="form-field__label"
              htmlFor={`comment-${hotline.id}`}
            >
              Comment (optional)
            </label>
            <textarea
              className="form-field__input"
              id={`comment-${hotline.id}`}
              maxLength={MAX_COMMENT_LENGTH}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              value={comment}
            />
            {errors.comment ? (
              <p className="form-field__error">{errors.comment}</p>
            ) : null}
          </div>

          <button className="action-button" disabled={submitting} type="submit">
            {submitting ? "Saving…" : "Save my rating"}
          </button>
        </form>
      ) : null}
    </li>
  );
}

/**
 * One directory shared by residents and responders.
 *
 * The legacy resident and responder pages each hardcoded their own copy of the
 * numbers, so the two audiences could be told different things to call.
 */
export default function HotlineDirectoryPage({ hotlineRepository }) {
  const { user, status } = useAuth();
  const uid = user?.uid;
  const repository = useMemo(
    () => hotlineRepository ?? createHotlineRepository(),
    [hotlineRepository],
  );

  const [hotlines, setHotlines] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [actionError, setActionError] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const results = await repository.listHotlines();

        if (activeRef.current !== requestId) {
          return;
        }

        setHotlines(results);
        setLoadState("ready");
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("error");
        }
      }
    },
    [repository],
  );

  useEffect(() => {
    activeRef.current += 1;
    load(activeRef.current);

    return () => {
      activeRef.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => {
    activeRef.current += 1;
    setLoadState("loading");
    load(activeRef.current);
  }, [load]);

  async function review(hotline, values) {
    setSubmittingId(hotline.id);
    setActionError(null);
    setActionNotice(null);

    try {
      await repository.submitReview({
        hotlineId: hotline.id,
        uid,
        rating: values.rating,
        comment: values.comment,
      });
      setActionNotice(
        "Your rating was saved. Rating again replaces it rather than adding another.",
      );
      refresh();
    } catch (error) {
      setActionError(
        error?.message ?? "That rating could not be saved. Try again.",
      );
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <Section
      id="hotlines"
      title="Emergency hotlines"
      description="Numbers are shown to everyone, signed in or not. Ratings come from accounts, one per person per hotline."
      action={
        <button
          className="action-button action-button--secondary"
          onClick={refresh}
          type="button"
        >
          Refresh
        </button>
      }
    >
      <FormStatus message={actionError} />
      <FormStatus message={actionNotice} tone="success" />

      {loadState === "loading" ? (
        <Skeleton label="Loading hotlines" lines={4} />
      ) : null}

      {loadState === "error" ? (
        <ErrorState
          title="The hotline directory could not be loaded"
          message="If this is an emergency, call your barangay hall or the national emergency line directly."
          actionLabel="Try again"
          onAction={refresh}
        />
      ) : null}

      {loadState === "ready" && hotlines.length === 0 ? (
        <EmptyState
          title="No hotlines listed yet"
          message="A reviewer adds hotline numbers centrally so residents and responders always see the same list. Contact your barangay hall in the meantime."
        />
      ) : null}

      {loadState === "ready" && hotlines.length > 0 ? (
        <ul className="report-list">
          {hotlines.map((hotline) => (
            <HotlineCard
              canReview={status === "authenticated"}
              hotline={hotline}
              key={hotline.id}
              onReview={review}
              submitting={submittingId === hotline.id}
            />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
