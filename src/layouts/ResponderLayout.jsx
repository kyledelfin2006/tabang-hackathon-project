import { Suspense, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import SkipLink from "../components/navigation/SkipLink.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import { useAuth } from "../app/providers/useAuth.js";
import usePageTitle from "../components/navigation/usePageTitle.js";
import { PageHeading } from "../components/ui/Primitives.jsx";

const baseItems = [
  { to: "/responder", label: "Dashboard" },
  { to: "/responder/incidents", label: "Incidents" },
  { to: "/responder/hotlines", label: "Hotlines" },
  { to: "/responder/account", label: "Account" },
];

const reviewerItem = {
  to: "/responder/applications",
  label: "Applications",
};

export default function ResponderLayout() {
  const pageTitle = usePageTitle();
  const location = useLocation();
  const { isReviewer } = useAuth();

  // Responders who are not reviewers would only be redirected away, so the
  // link is not shown to them at all.
  const items = useMemo(
    () =>
      isReviewer
        ? [baseItems[0], baseItems[1], reviewerItem, ...baseItems.slice(2)]
        : baseItems,
    [isReviewer],
  );

  return (
    <div className="shell shell--responder">
      <SkipLink />
      <AppHeader />
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
      <BottomNav items={items} />
    </div>
  );
}
