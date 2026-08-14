import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

const residentItems = [
  { to: "/app", label: "Home" },
  { to: "/app/community", label: "Community" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/hotlines", label: "Hotlines" },
  { to: "/app/account", label: "Account" },
];

export default function ResidentLayout() {
  return (
    <div className="shell shell--resident">
      <AppHeader
        eyebrow="Resident shell"
        title="Resident Experience"
        subtitle="Shared layout, navigation, and feedback components for resident routes."
        actionLabel="Legacy home"
        actionHref="/Homepage.html"
      />
      <main className="shell__content shell__content--with-nav">
        <Outlet />
      </main>
      <BottomNav items={residentItems} />
    </div>
  );
}
