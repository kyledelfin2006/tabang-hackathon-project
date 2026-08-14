import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import ReportCard from "../../components/reports/ReportCard.jsx";
import { Section, Skeleton } from "../../components/ui/Primitives.jsx";
import { createAdvisoryRepository } from "../../services/advisories/advisoryRepository.js";

/**
 * The community feed reads publicFeed only.
 *
 * It never touches the reports collection, so there is no code path here that
 * could surface a description, a contact number, or coordinates. Location is
 * shown as a barangay name and nothing more.
 */
export default function CommunityFeedPage({ advisoryRepository }) {
  const repository = useMemo(
    () => advisoryRepository ?? createAdvisoryRepository(),
    [advisoryRepository],
  );

  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const activeRef = useRef(0);

  const load = useCallback(
    async (requestId) => {
      try {
        const results = await repository.listRecentAdvisories();

        if (activeRef.current !== requestId) {
          return;
        }

        setItems(results);
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
      // Drop any in-flight response when the route unmounts.
      activeRef.current += 1;
    };
  }, [load]);

  const retry = useCallback(() => {
    activeRef.current += 1;
    setLoadState("loading");
    load(activeRef.current);
  }, [load]);

  return (
    <Section
      id="community"
      title="Community advisories"
      description="Advisories published by responders. Barangay level only — no exact locations, contact numbers, or resident photos."
    >
      {loadState === "loading" ? (
        <Skeleton label="Loading community advisories" lines={4} />
      ) : null}

      {loadState === "error" ? (
        <ErrorState
          title="Advisories could not be loaded"
          message="Try again in a moment. Your own reports are unaffected."
          actionLabel="Try again"
          onAction={retry}
        />
      ) : null}

      {loadState === "ready" && items.length === 0 ? (
        <EmptyState
          title="No advisories published yet"
          message="Responders publish advisories here after reviewing incoming reports. Individual reports are never listed automatically."
        />
      ) : null}

      {loadState === "ready" && items.length > 0 ? (
        <ul className="report-list">
          {items.map((item) => (
            <ReportCard key={item.id} report={item} variant="public" />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
