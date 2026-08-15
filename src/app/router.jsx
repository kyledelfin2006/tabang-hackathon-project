/* eslint-disable react-refresh/only-export-components --
 * This module is the route table, not a component module. The lazy() bindings
 * are route definitions that sit alongside the exported route array, so fast
 * refresh cannot treat the file as a single component and the rule does not
 * apply usefully here.
 */
import { lazy } from "react";
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
import {
  LandingRoute,
  NotFoundRoute,
  RouteErrorPage,
} from "../routes/pages.jsx";

// Routes behind a guard are split out, so a resident never downloads the
// responder workspace and a responder never downloads the report forms.
const ResidentHomePage = lazy(() => import("../routes/home/ResidentHomePage.jsx"));
const ReportFormPage = lazy(() => import("../routes/reports/ReportFormPage.jsx"));
const MyReportsPage = lazy(() => import("../routes/reports/MyReportsPage.jsx"));
const CommunityFeedPage = lazy(() => import("../routes/community/CommunityFeedPage.jsx"));
const ResponderApplicationPage = lazy(() => import("../routes/responder/ResponderApplicationPage.jsx"));
const ReviewQueuePage = lazy(() => import("../routes/responder/ReviewQueuePage.jsx"));
const IncidentQueuePage = lazy(() => import("../routes/responder/IncidentQueuePage.jsx"));
const IncidentDetailPage = lazy(() => import("../routes/responder/IncidentDetailPage.jsx"));
const ResponderDashboardPage = lazy(() => import("../routes/responder/ResponderDashboardPage.jsx"));
const HotlineDirectoryPage = lazy(() => import("../routes/hotlines/HotlineDirectoryPage.jsx"));
const AccountPage = lazy(() => import("../routes/account/AccountPage.jsx"));

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
      { path: "hotlines", element: <HotlineDirectoryPage /> },
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
      { index: true, element: <ResponderDashboardPage /> },
      { path: "incidents", element: <IncidentQueuePage /> },
      { path: "incidents/:id", element: <IncidentDetailPage /> },
      {
        path: "applications",
        element: (
          <RequireReviewer>
            <ReviewQueuePage />
          </RequireReviewer>
        ),
      },
      { path: "hotlines", element: <HotlineDirectoryPage /> },
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
