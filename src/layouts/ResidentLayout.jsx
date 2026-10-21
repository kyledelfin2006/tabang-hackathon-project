import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import SkipLink from "../components/navigation/SkipLink.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import NavDrawer from "../components/navigation/NavDrawer.jsx";
import { useAuth } from "../app/providers/useAuth.js";
import usePageTitle from "../components/navigation/usePageTitle.js";
import { PageHeading } from "../components/ui/Primitives.jsx";
import { createSubmissionQueue } from "../services/offline/submissionQueue.js";
import { replayQueuedReports } from "../services/reports/replayQueuedReports.js";

const bottomNavItems = [
  { to: "/app", label: "Home" },
  { to: "/app/reports/new", label: "Report" },
  { to: "/app/help/new", label: "Request" },
  { to: "/app/hotlines", label: "Hotlines" },
  { to: "/app/reports", label: "Reports" },
];

const drawerItems = [
  { to: "/app", label: "Home", end: true },
  { to: "/app/reports/new", label: "Report flood" },
  { to: "/app/help/new", label: "Request help" },
  { to: "/app/hotlines", label: "Hotlines" },
  { to: "/app/reports", label: "My reports" },
  { to: "/app/responder-application", label: "Apply as responder" },
  { to: "/app/account", label: "Account" },
];

export default function ResidentLayout({ submissionQueue, reportRepository }) {
  const pageTitle = usePageTitle();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isResponder, signOut, user } = useAuth();
  const navigate = useNavigate();
  const reporterId = user?.uid;

  // Reports saved on this phone are resent when the app opens and whenever
  // the connection comes back, without the resident having to remember.
  useEffect(() => {
    if (!reporterId) {
      return undefined;
    }

    const queue = submissionQueue ?? createSubmissionQueue();
    const replay = async () => {
      if (queue.list().length === 0) {
        return;
      }

      try {
        // Loaded on demand to keep the entry chunk small.
        const repository =
          reportRepository ??
          (
            await import("../services/reports/reportRepository.js")
          ).createReportRepository();

        await replayQueuedReports({ queue, repository, reporterId });
      } catch {
        // The entries stay queued and are retried on the next open or online.
      }
    };

    replay();
    window.addEventListener("online", replay);

    return () => window.removeEventListener("online", replay);
  }, [reporterId, submissionQueue, reportRepository]);

  async function handleSignOut() {
    setDrawerOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell shell--resident">
      <SkipLink />
      <AppHeader
        menu={{
          label: "Open navigation menu",
          controls: "resident-drawer",
          expanded: drawerOpen,
          onOpen: () => setDrawerOpen(true),
        }}
      />

      <NavDrawer
        footer={
          <button
            className="action-button action-button--secondary"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        }
        id="resident-drawer"
        items={
          isResponder
            ? [
                ...drawerItems,
                { to: "/responder", label: "Responder workspace" },
              ]
            : drawerItems
        }
        labelledBy="resident-drawer-title"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Menu"
      />

      <main className="shell__content shell__content--with-nav" id="main">
        <PageHeading key={location.pathname}>{pageTitle}</PageHeading>
        <Suspense
          fallback={
            <LoadingState
              title="Loading"
              message="Fetching this part of the app."
            />
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <BottomNav items={bottomNavItems} />
    </div>
  );
}
