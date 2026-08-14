import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";

export default function PublicLayout() {
  return (
    <div className="shell shell--public">
      <AppHeader
        eyebrow="Phase 1 shell"
        title="Tabang"
        subtitle="A shared application shell for the migration to route-based pages."
        actionLabel="Legacy prototype"
        actionHref="/legacy-index.html"
      />
      <main className="shell__content">
        <Outlet />
      </main>
    </div>
  );
}
