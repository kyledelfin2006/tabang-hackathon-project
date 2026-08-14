import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import { useAuth } from "../app/providers/useAuth.js";

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
      <AppHeader
        eyebrow="Responder shell"
        title="Responder Workspace"
        subtitle="Protected layout placeholders for operational routes and shared responder chrome."
        actionLabel="Legacy dashboard"
        actionHref="/responderhomepage.html"
      />
      <main className="shell__content shell__content--with-nav">
        <Outlet />
      </main>
      <BottomNav items={items} />
    </div>
  );
}
