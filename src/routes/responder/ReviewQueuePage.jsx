import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import Modal from "../../components/feedback/Modal.jsx";
import { FormStatus } from "../../components/forms/FormField.jsx";
import { Badge, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { describeActionError } from "../../services/errors/describeActionError.js";
import { createReviewRepository } from "../../services/responders/reviewRepository.js";

function formatWhen(millis) {
  return millis ? new Date(millis).toLocaleString() : "Time not recorded";
}

export default function ReviewQueuePage({ reviewRepository }) {
  const repository = useMemo(
    () => reviewRepository ?? createReviewRepository(),
    [reviewRepository],
  );

  const [applications, setApplications] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [pendingDecision, setPendingDecision] = useState(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(null);
  const [evidenceLinks, setEvidenceLinks] = useState({});
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

  // Fetches a link that expires in minutes; the reviewer opens it from the
  // card, so no pop-up blocker or lost tab is involved.
  async function fetchEvidenceLink(path) {
    setStatus(null);

    try {
      const url = await repository.getEvidenceUrl(path);

      setEvidenceLinks((current) => ({ ...current, [path]: url }));
    } catch (error) {
      setStatus({ tone: "error", message: describeActionError(error) });
    }
  }

  async function confirmDecision() {
    const decision = pendingDecision;

    setPendingDecision(null);
    setStatus(null);

    if (!decision) {
      return;
    }

    try {
      const { evidenceDeleted } = await repository.decide({
        application: decision.application,
        approve: decision.approve,
        notes,
      });

      setApplications((current) =>
        current.filter((item) => item.id !== decision.application.id),
      );
      setNotes("");
      setStatus(
        evidenceDeleted
          ? {
              tone: "success",
              message: `Decision recorded for ${decision.application.applicantName || "the applicant"}. Their identity documents were deleted.`,
            }
          : {
              tone: "error",
              message: `Decision recorded for ${decision.application.applicantName || "the applicant"}, but evidence deletion is pending: the identity documents could not be deleted. Ask an administrator to remove them.`,
            },
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message: `The decision could not be recorded. Nothing was changed. ${describeActionError(error)}`,
      });
    }
  }

  return (
    <Section
      id="review-queue"
      title="Responder applications"
      description="Approving grants responder access immediately. Identity documents are deleted once you record a decision."
    >
      <FormStatus message={status?.message} tone={status?.tone} />

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

              <h3 className="report-card__title">
                {application.applicantName || "Name not provided"}
              </h3>

              <div className="detail-list">
                <span>
                  <strong>Email</strong>
                  {application.applicantEmail || "Not provided"}
                </span>
                <span>
                  <strong>Organization</strong>
                  {application.organization}
                </span>
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
                {[
                  ["ID", application.identityDocumentPath],
                  ["selfie", application.selfiePath],
                ]
                  .filter(([, path]) => path)
                  .map(([label, path]) =>
                    evidenceLinks[path] ? (
                      <a
                        className="action-button action-button--secondary"
                        href={evidenceLinks[path]}
                        key={path}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Open the {label} (link expires in 5 minutes)
                      </a>
                    ) : (
                      <button
                        className="action-button action-button--secondary"
                        key={path}
                        onClick={() => fetchEvidenceLink(path)}
                        type="button"
                      >
                        View {label}
                      </button>
                    ),
                  )}
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
            ? "This grants responder access immediately and deletes the identity documents. Only the decision, your notes, your account, and the timestamp are kept."
            : "This records a rejection and deletes the identity documents. The applicant sees your notes and may apply again."
        }
        onClose={() => setPendingDecision(null)}
        onConfirm={confirmDecision}
        open={Boolean(pendingDecision)}
        title={
          pendingDecision?.approve
            ? "Approve this application?"
            : "Reject this application?"
        }
      >
        <div className="form-field">
          <label className="form-field__label" htmlFor="review-notes">
            Notes for the record (optional)
          </label>
          <textarea
            className="form-field__input"
            id="review-notes"
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            value={notes}
          />
        </div>
      </Modal>
    </Section>
  );
}
