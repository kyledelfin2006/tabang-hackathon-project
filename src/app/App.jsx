import { RouterProvider } from "react-router-dom";
import AppProviders from "./providers/AppProviders.jsx";
import AppErrorBoundary from "./ErrorBoundary.jsx";
import { appRouter } from "./router.jsx";

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <RouterProvider router={appRouter} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
