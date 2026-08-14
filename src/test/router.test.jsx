import { render, screen } from "@testing-library/react";
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

describe("application shell routing", () => {
  it("renders the public landing route", async () => {
    renderRoute("/");
    expect(
      await screen.findByText("Report flooding and request help in Aklan"),
    ).toBeInTheDocument();
  });

  it("renders the resident layout for a signed-in resident", async () => {
    renderRoute("/app", residentSession());
    expect(
      await screen.findByText("What do you need right now?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary route navigation" }),
    ).toBeInTheDocument();
  });

  it("renders the responder layout for a responder", async () => {
    renderRoute("/responder", responderSession());
    expect(await screen.findByText("Responder Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Responder layout")).toBeInTheDocument();
  });

  it("renders the not-found route", async () => {
    renderRoute("/missing-route");
    expect(
      await screen.findByText(
        "That route is outside the current migration scope.",
      ),
    ).toBeInTheDocument();
  });
});
