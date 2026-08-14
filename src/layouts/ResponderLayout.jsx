import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

const responderItems = [
  { to: "/responder", label: "Dashboard" },
  { to: "/responder/incidents", label: "Incidents" },
  { to: "/responder/hotlines", label: "Hotlines" },
  { to: "/responder/account", label: "Account" },
];

export default function ResponderLayout() {
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
      <BottomNav items={responderItems} />
    </div>
  );
}
