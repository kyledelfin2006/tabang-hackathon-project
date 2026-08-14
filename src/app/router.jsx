import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout.jsx";
import ResidentLayout from "../layouts/ResidentLayout.jsx";
import ResponderLayout from "../layouts/ResponderLayout.jsx";
import {
  AccountRoute,
  CommunityRoute,
  HelpRequestRoute,
  HotlinesRoute,
  IncidentDetailRoute,
  IncidentsRoute,
  LandingRoute,
  LoginRoute,
  NotFoundRoute,
  PrivacyRoute,
  ReportFloodRoute,
  ReportsRoute,
  ResponderAccountRoute,
  ResponderApplicationRoute,
  ResponderDashboardRoute,
  ResponderHotlinesRoute,
  ResidentHomeRoute,
  RouteErrorPage,
  SignupRoute,
} from "../routes/pages.jsx";

export const appRoutes = [
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingRoute /> },
      { path: "login", element: <LoginRoute /> },
      { path: "signup", element: <SignupRoute /> },
      { path: "privacy", element: <PrivacyRoute /> },
    ],
  },
  {
    path: "/app",
    element: <ResidentLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <ResidentHomeRoute /> },
      { path: "community", element: <CommunityRoute /> },
      { path: "reports", element: <ReportsRoute /> },
      { path: "reports/new", element: <ReportFloodRoute /> },
      { path: "help/new", element: <HelpRequestRoute /> },
      { path: "hotlines", element: <HotlinesRoute /> },
      { path: "account", element: <AccountRoute /> },
      { path: "responder-application", element: <ResponderApplicationRoute /> },
    ],
  },
  {
    path: "/responder",
    element: <ResponderLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <ResponderDashboardRoute /> },
      { path: "incidents", element: <IncidentsRoute /> },
      { path: "incidents/:id", element: <IncidentDetailRoute /> },
      { path: "hotlines", element: <ResponderHotlinesRoute /> },
      { path: "account", element: <ResponderAccountRoute /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundRoute />,
  },
];

export const appRouter = createBrowserRouter(appRoutes);

export function createTestRouter(initialEntries = ["/"]) {
  return createMemoryRouter(appRoutes, { initialEntries });
}
