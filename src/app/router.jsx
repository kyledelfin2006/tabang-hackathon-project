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
import UpdatePasswordPage from "../routes/auth/UpdatePasswordPage.jsx";
import {
  LandingRoute,
  NotFoundRoute,
  RouteErrorPage,
} from "../routes/pages.jsx";

// Routes behind a guard are split out, so a resident never downloads the
// responder workspace and a responder never downloads the report forms.
const ResidentHomePage = lazy(
  () => import("../routes/home/ResidentHomePage.jsx"),
);
const ReportFormPage = lazy(
  () => import("../routes/reports/ReportFormPage.jsx"),
);
const MyReportsPage = lazy(() => import("../routes/reports/MyReportsPage.jsx"));
const CommunityFeedPage = lazy(
  () => import("../routes/community/CommunityFeedPage.jsx"),
);
const ResponderApplicationPage = lazy(
  () => import("../routes/responder/ResponderApplicationPage.jsx"),
);
const ReviewQueuePage = lazy(
  () => import("../routes/responder/ReviewQueuePage.jsx"),
);
const IncidentQueuePage = lazy(
  () => import("../routes/responder/IncidentQueuePage.jsx"),
);
const IncidentDetailPage = lazy(
  () => import("../routes/responder/IncidentDetailPage.jsx"),
);
const ResponderDashboardPage = lazy(
  () => import("../routes/responder/ResponderDashboardPage.jsx"),
);
const HotlineDirectoryPage = lazy(
  () => import("../routes/hotlines/HotlineDirectoryPage.jsx"),
);
const AccountPage = lazy(() => import("../routes/account/AccountPage.jsx"));

export const appRoutes = [
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    handle: { title: "Tabang" },
    children: [
      {
        index: true,
        element: <LandingRoute />,
        handle: { title: "Report flooding and request help in Aklan" },
      },
      {
        path: "hotlines",
        element: <HotlineDirectoryPage />,
        handle: { title: "Emergency hotlines" },
      },
      {
        path: "login",
        element: (
          <RequireAnonymous>
            <LoginPage />
          </RequireAnonymous>
        ),
        handle: { title: "Sign in to Tabang" },
      },
      {
        path: "signup",
        element: (
          <RequireAnonymous>
            <SignupPage />
          </RequireAnonymous>
        ),
        handle: { title: "Create a resident account" },
      },
      {
        path: "reset-password",
        element: (
          <RequireAnonymous>
            <ResetPasswordPage />
          </RequireAnonymous>
        ),
        handle: { title: "Reset your password" },
      },
      {
        path: "update-password",
        element: (
          <RequireAuth>
            <UpdatePasswordPage />
          </RequireAuth>
        ),
        handle: { title: "Choose a new password" },
      },
      {
        path: "privacy",
        element: <PrivacyPage />,
        handle: { title: "Privacy policy and terms" },
      },
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
    handle: { title: "Resident workspace" },
    children: [
      {
        index: true,
        element: <ResidentHomePage />,
        handle: { title: "Resident home" },
      },
      {
        path: "community",
        element: <CommunityFeedPage />,
        handle: { title: "Community advisories" },
      },
      {
        path: "reports",
        element: <MyReportsPage />,
        handle: { title: "My reports" },
      },
      {
        path: "reports/new",
        element: <ReportFormPage kind="flood" />,
        handle: { title: "Report a flood" },
      },
      {
        path: "help/new",
        element: <ReportFormPage kind="help" />,
        handle: { title: "Ask for assistance" },
      },
      {
        path: "hotlines",
        element: <HotlineDirectoryPage />,
        handle: { title: "Resident emergency hotlines" },
      },
      {
        path: "account",
        element: <AccountPage />,
        handle: { title: "Resident account" },
      },
      {
        path: "responder-application",
        element: <ResponderApplicationPage />,
        handle: { title: "Responder application" },
      },
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
    handle: { title: "Responder workspace" },
    children: [
      {
        index: true,
        element: <ResponderDashboardPage />,
        handle: { title: "Responder dashboard" },
      },
      {
        path: "incidents",
        element: <IncidentQueuePage />,
        handle: { title: "Incident queue" },
      },
      {
        path: "incidents/:id",
        element: <IncidentDetailPage />,
        handle: { title: "Incident details" },
      },
      {
        path: "applications",
        element: (
          <RequireReviewer>
            <ReviewQueuePage />
          </RequireReviewer>
        ),
        handle: { title: "Review applications" },
      },
      {
        path: "hotlines",
        element: <HotlineDirectoryPage />,
        handle: { title: "Responder hotlines" },
      },
      {
        path: "account",
        element: <AccountPage />,
        handle: { title: "Responder account" },
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundRoute />,
    handle: { title: "Page not found" },
  },
];

export const appRouter = createBrowserRouter(appRoutes);

export function createTestRouter(initialEntries = ["/"]) {
  return createMemoryRouter(appRoutes, { initialEntries });
}
