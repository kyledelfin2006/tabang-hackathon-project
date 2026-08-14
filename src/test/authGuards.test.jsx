import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { createTestRouter } from "../app/router.jsx";
import {
  createFakeAuthGateway,
  residentSession,
  responderSession,
} from "./fakeAuthGateway.js";

function renderRoute(path, session = null) {
  const gateway = createFakeAuthGateway({ session });
  const router = createTestRouter([path]);

  render(
    <AppProviders authGateway={gateway}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { gateway, router };
}

describe("route guards", () => {
  it("sends a signed-out visitor from a protected route to login", async () => {
    const { router } = renderRoute("/app/reports");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });

  it("does not render protected content before the session resolves", () => {
    renderRoute("/app");

    // Synchronously, the session is still loading.
    expect(screen.queryByText("Resident Home")).not.toBeInTheDocument();
    expect(screen.getByText("Checking your session")).toBeInTheDocument();
  });

  it("keeps a resident out of responder routes", async () => {
    const { router } = renderRoute("/responder", residentSession());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app");
    });
    expect(screen.queryByText("Responder Dashboard")).not.toBeInTheDocument();
  });

  it("allows a responder into responder routes", async () => {
    const { router } = renderRoute("/responder/incidents", responderSession());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/responder/incidents");
    });
    expect(await screen.findByText("Incident Queue")).toBeInTheDocument();
  });

  it("redirects a signed-in resident away from the login route", async () => {
    const { router } = renderRoute("/login", residentSession());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app");
    });
  });

  it("sends a signed-in responder from the login route to the responder home", async () => {
    const { router } = renderRoute("/login", responderSession());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/responder");
    });
  });

  it("drops a resident out of protected routes when the session ends", async () => {
    const { gateway, router } = renderRoute("/app", residentSession());

    await screen.findByText("Resident Home");
    gateway.emit(null);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });

  it("re-evaluates access when a role is granted mid-session", async () => {
    const { gateway, router } = renderRoute("/app", residentSession());

    await screen.findByText("Resident Home");
    gateway.emit(responderSession());
    router.navigate("/responder");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/responder");
    });
    expect(await screen.findByText("Responder Dashboard")).toBeInTheDocument();
  });

  it("keeps the privacy policy reachable while signed out", async () => {
    renderRoute("/privacy");
    expect(
      await screen.findByText("Privacy policy and terms"),
    ).toBeInTheDocument();
  });
});
