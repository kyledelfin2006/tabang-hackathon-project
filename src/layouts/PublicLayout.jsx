import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import SkipLink from "../components/navigation/SkipLink.jsx";

export default function PublicLayout() {
  return (
    <div className="shell shell--public">
      <SkipLink />
      <AppHeader
        eyebrow="Phase 1 shell"
        title="Tabang"
        subtitle="A shared application shell for the migration to route-based pages."
        actionLabel="Legacy prototype"
        actionHref="/legacy-index.html"
      />
      <main className="shell__content" id="main">
        <Outlet />
      </main>
    </div>
  );
}
