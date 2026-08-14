import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import PublicLayout from "../layouts/PublicLayout.jsx";
import ResidentLayout from "../layouts/ResidentLayout.jsx";
import ResponderLayout from "../layouts/ResponderLayout.jsx";
import {
  RequireAnonymous,
  RequireAuth,
  RequireResponder,
  RequireReviewer,
} from "../components/routing/RouteGuards.jsx";
import LoginPage from "../routes/auth/LoginPage.jsx";
import PrivacyPage from "../routes/auth/PrivacyPage.jsx";
import ResetPasswordPage from "../routes/auth/ResetPasswordPage.jsx";
import SignupPage from "../routes/auth/SignupPage.jsx";
import AccountPage from "../routes/account/AccountPage.jsx";
import ResidentHomePage from "../routes/home/ResidentHomePage.jsx";
import ReportFormPage from "../routes/reports/ReportFormPage.jsx";
import MyReportsPage from "../routes/reports/MyReportsPage.jsx";
import CommunityFeedPage from "../routes/community/CommunityFeedPage.jsx";
import ResponderApplicationPage from "../routes/responder/ResponderApplicationPage.jsx";
import ReviewQueuePage from "../routes/responder/ReviewQueuePage.jsx";
import {
  HotlinesRoute,
  IncidentDetailRoute,
  IncidentsRoute,
  LandingRoute,
  NotFoundRoute,
  ResponderDashboardRoute,
  ResponderHotlinesRoute,
  RouteErrorPage,
} from "../routes/pages.jsx";

export const appRoutes = [
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingRoute /> },
      {
        path: "login",
        element: (
          <RequireAnonymous>
            <LoginPage />
          </RequireAnonymous>
        ),
      },
      {
        path: "signup",
        element: (
          <RequireAnonymous>
            <SignupPage />
          </RequireAnonymous>
        ),
      },
      {
        path: "reset-password",
        element: (
          <RequireAnonymous>
            <ResetPasswordPage />
          </RequireAnonymous>
        ),
      },
      { path: "privacy", element: <PrivacyPage /> },
    ],
  },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <ResidentLayout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <ResidentHomePage /> },
      { path: "community", element: <CommunityFeedPage /> },
      { path: "reports", element: <MyReportsPage /> },
      { path: "reports/new", element: <ReportFormPage kind="flood" /> },
      { path: "help/new", element: <ReportFormPage kind="help" /> },
      { path: "hotlines", element: <HotlinesRoute /> },
      { path: "account", element: <AccountPage /> },
      { path: "responder-application", element: <ResponderApplicationPage /> },
    ],
  },
  {
    path: "/responder",
    element: (
      <RequireResponder>
        <ResponderLayout />
      </RequireResponder>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <ResponderDashboardRoute /> },
      { path: "incidents", element: <IncidentsRoute /> },
      { path: "incidents/:id", element: <IncidentDetailRoute /> },
      {
        path: "applications",
        element: (
          <RequireReviewer>
            <ReviewQueuePage />
          </RequireReviewer>
        ),
      },
      { path: "hotlines", element: <ResponderHotlinesRoute /> },
      { path: "account", element: <AccountPage area="Responder route" /> },
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
