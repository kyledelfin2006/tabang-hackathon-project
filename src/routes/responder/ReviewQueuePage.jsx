import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import Modal from "../../components/feedback/Modal.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { createReviewRepository } from "../../services/responders/reviewRepository.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

export default function ReviewQueuePage({ reviewRepository }) {
  const { user } = useAuth();
  const reviewerId = user?.uid;
  const repository = useMemo(
    () => reviewRepository ?? createReviewRepository(),
    [reviewRepository],
  );

  const [applications, setApplications] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [pendingDecision, setPendingDecision] = useState(null);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState(null);
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const items = await repository.listPendingApplications();

        if (activeRef.current !== requestId) {
          return;
        }

        setApplications(items);
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

  const retry = useCallback(() => {
    activeRef.current += 1;
    setLoadState("loading");
    load(activeRef.current);
  }, [load]);

  async function confirmDecision() {
    const decision = pendingDecision;

    setPendingDecision(null);
    setActionError(null);

    if (!decision) {
      return;
    }

    try {
      await repository.decide({
        application: decision.application,
        approve: decision.approve,
        notes,
        reviewerId,
      });

      setApplications((current) =>
        current.filter((item) => item.id !== decision.application.id),
      );
      setNotes("");
    } catch {
      setActionError(
        "The decision could not be recorded. Nothing was changed; try again.",
      );
    }
  }

  return (
    <Section
      id="review-queue"
      title="Responder applications"
      description="Approving grants responder access immediately. Identity documents are deleted once you record a decision."
    >
      <FormStatus message={actionError} />

      {loadState === "loading" ? (
        <Skeleton label="Loading applications" lines={4} />
      ) : null}

      {loadState === "error" ? (
        <ErrorState
          title="Applications could not be loaded"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={retry}
        />
      ) : null}

      {loadState === "ready" && applications.length === 0 ? (
        <EmptyState
          title="No applications waiting"
          message="New responder applications appear here as soon as they are submitted."
        />
      ) : null}

      {loadState === "ready" && applications.length > 0 ? (
        <ul className="report-list">
          {applications.map((application) => (
            <li className="report-card" key={application.id}>
              <div className="report-card__meta">
                <Badge tone="warning">Pending</Badge>
                <span>{formatWhen(application.submittedAtMillis)}</span>
              </div>

              <h4 className="report-card__title">{application.organization}</h4>

              <div className="detail-list">
                <span>
                  <strong>Badge number</strong>
                  {application.badgeNumber}
                </span>
                <span>
                  <strong>Municipality</strong>
                  {application.municipality}
                </span>
                <span>
                  <strong>Consent version</strong>
                  {application.consentVersion}
                </span>
              </div>

              <div className="button-row">
                <button
                  className="action-button"
                  onClick={() =>
                    setPendingDecision({ application, approve: true })
                  }
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="action-button action-button--secondary"
                  onClick={() =>
                    setPendingDecision({ application, approve: false })
                  }
                  type="button"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Modal
        confirmLabel={
          pendingDecision?.approve
            ? "Approve and grant access"
            : "Reject the application"
        }
        description={
          pendingDecision?.approve
            ? "This grants responder access immediately and deletes the identity documents. Only the decision, your account, and the timestamp are kept."
            : "This records a rejection and deletes the identity documents. Only the decision, your account, and the timestamp are kept."
        }
        onClose={() => setPendingDecision(null)}
        onConfirm={confirmDecision}
        open={Boolean(pendingDecision)}
        title={
          pendingDecision?.approve
            ? "Approve this application?"
            : "Reject this application?"
        }
      />
    </Section>
  );
}
