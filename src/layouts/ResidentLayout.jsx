import { Suspense, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import SkipLink from "../components/navigation/SkipLink.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";
import NavDrawer from "../components/navigation/NavDrawer.jsx";
import { useAuth } from "../app/providers/useAuth.js";

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
  { to: "/app/community", label: "Community advisories" },
  { to: "/app/responder-application", label: "Apply as responder" },
  { to: "/app/account", label: "Account" },
];

export default function ResidentLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.displayName || user?.displayName || "Resident";

  async function handleSignOut() {
    setDrawerOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell shell--resident">
      <SkipLink />
      <AppHeader
        eyebrow="Tabang"
        title={`Kumusta, ${displayName}`}
        subtitle="Report flooding, request help, and reach the hotlines serving Aklan."
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
        items={drawerItems}
        labelledBy="resident-drawer-title"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Menu"
      />

      <main className="shell__content shell__content--with-nav" id="main">
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
