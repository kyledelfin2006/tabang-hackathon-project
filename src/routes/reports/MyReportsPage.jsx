import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../app/providers/useAuth.js";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import Modal from "../../components/feedback/Modal.jsx";
import ReportCard from "../../components/reports/ReportCard.jsx";
import { ActionLink, Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { createReportRepository } from "../../services/reports/reportRepository.js";

export default function MyReportsPage({ reportRepository }) {
  const { user } = useAuth();
  const reporterId = user?.uid;
  const repository = useMemo(
    () => reportRepository ?? createReportRepository(),
    [reportRepository],
  );

  const [reports, setReports] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(null);

  // Guards against a response arriving after the route unmounts.
  const activeRef = useRef(0);

  const loadFirstPage = useCallback(
    async (requestId) => {
      try {
        const page = await repository.listMyReports({ reporterId });

        if (activeRef.current !== requestId) {
          return;
        }

        setReports(page.reports);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setLoadState("ready");
      } catch {
        if (activeRef.current === requestId) {
          setLoadState("error");
        }
      }
    },
    [repository, reporterId],
  );

  useEffect(() => {
    activeRef.current += 1;
    loadFirstPage(activeRef.current);

    return () => {
      activeRef.current += 1;
    };
  }, [loadFirstPage]);

  const retry = useCallback(() => {
    activeRef.current += 1;
    setLoadState("loading");
    loadFirstPage(activeRef.current);
  }, [loadFirstPage]);

  async function loadMore() {
    setLoadingMore(true);

    try {
      const page = await repository.listMyReports({ reporterId, cursor });

      setReports((current) => [...current, ...page.reports]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmCancel() {
    const target = pendingCancel;

    setPendingCancel(null);

    if (!target) {
      return;
    }

    await repository.cancelReport({ reportId: target.id });
    setReports((current) =>
      current.map((report) =>
        report.id === target.id
          ? { ...report, incidentStatus: "cancelled", isCancelled: true }
          : report,
      ),
    );
  }

  return (
    <Section
      id="my-reports"
      title="My reports"
      description="Only your own reports appear here. Responders handling them can also see them."
      action={<ActionLink to="/app/reports/new">New report</ActionLink>}
    >
      {loadState === "loading" ? (
        <Skeleton label="Loading your reports" lines={4} />
      ) : null}

      {loadState === "error" ? (
        <ErrorState
          title="Your reports could not be loaded"
          message="This does not affect reports you have already filed."
          actionLabel="Try again"
          onAction={retry}
        />
      ) : null}

      {loadState === "ready" && reports.length === 0 ? (
        <EmptyState
          title="You have not filed any reports"
          message="When you report flooding or request help, it will appear here with its current status."
        />
      ) : null}

      {loadState === "ready" && reports.length > 0 ? (
        <>
          <ul className="report-list">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                onCancel={setPendingCancel}
                report={report}
                variant="personal"
              />
            ))}
          </ul>

          {hasMore ? (
            <div className="button-row">
              <button
                className="action-button action-button--secondary"
                disabled={loadingMore}
                onClick={loadMore}
                type="button"
              >
                {loadingMore ? "Loading…" : "Load older reports"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal
        confirmLabel="Cancel the report"
        description="Responders keep a record of this report so the response history stays intact, but it will no longer be treated as active. This cannot be undone."
        onClose={() => setPendingCancel(null)}
        onConfirm={confirmCancel}
        open={Boolean(pendingCancel)}
        title="Cancel this report?"
      />
    </Section>
  );
}
