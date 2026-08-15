import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import AppHeader from "../components/navigation/AppHeader.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import SkipLink from "../components/navigation/SkipLink.jsx";

export default function PublicLayout() {
  return (
    <div className="shell shell--public">
      <SkipLink />
      <AppHeader
        eyebrow="Phase 1 shell"
        title="Tabang"
        subtitle="Report flooding, request help, and reach emergency hotlines in Aklan."
      />
      <main className="shell__content" id="main">
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
    </div>
  );
}
