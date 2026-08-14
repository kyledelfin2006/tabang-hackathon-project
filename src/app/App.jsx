import { RouterProvider } from "react-router-dom";
import AppProviders from "./providers/AppProviders.jsx";
import AppErrorBoundary from "./ErrorBoundary.jsx";
import { appRouter } from "./router.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider
          router={appRouter}
          fallbackElement={
            <LoadingState
              title="Loading the new shell"
              message="Bootstrapping the Phase 1 application shell."
            />
          }
        />
      </AppProviders>
    </AppErrorBoundary>
  );
}
