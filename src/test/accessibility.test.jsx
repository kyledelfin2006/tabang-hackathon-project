import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { createTestRouter } from "../app/router.jsx";
import { STATUS_LABEL } from "../components/incidents/statusLabels.js";
import {
  createFakeAuthGateway,
  residentSession,
  responderSession,
} from "./fakeAuthGateway.js";

function renderRoute(path, session) {
  const router = createTestRouter([path]);

  render(
    <AppProviders authGateway={createFakeAuthGateway({ session })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

describe("zoom", () => {
  it("does not disable pinch zoom on any page", () => {
    // Blocking zoom stops somebody with low vision enlarging an emergency
    // number, which is exactly when they most need to read it.
    const pages = [
      "index.html",
      "legacy-index.html",
      "Homepage.html",
      "Login.html",
      "signup.html",
      "AccountInfo.html",
      "AccountInformation.html",
      "Loginresponder.html",
    ];

    for (const page of pages) {
      const html = readFileSync(page, "utf8");

      expect(html).not.toMatch(/maximum-scale/i);
      expect(html).not.toMatch(/user-scalable\s*=\s*no/i);
    }
  });
});

describe("skip navigation", () => {
  it("offers a skip link before the header on a resident route", async () => {
    renderRoute("/app", residentSession());

    const skip = await screen.findByRole("link", {
      name: "Skip to main content",
    });

    expect(skip).toHaveAttribute("href", "#main");
    // It must come before the header in the DOM to be reachable first.
    expect(document.body.textContent.indexOf("Skip to main content")).toBe(0);
  });

  it("offers one on the public shell too", async () => {
    renderRoute("/login", null);

    expect(
      await screen.findByRole("link", { name: "Skip to main content" }),
    ).toBeInTheDocument();
  });

  it("points at a main landmark that exists", async () => {
    renderRoute("/app", residentSession());

    await screen.findByRole("link", { name: "Skip to main content" });
    expect(document.querySelector("main#main")).not.toBeNull();
  });
});

describe("status is never signalled by colour alone", () => {
  it("gives every incident status a text label", () => {
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(label).toBeTruthy();
      expect(label).not.toBe(status);
    }
  });
});

describe("keyboard-safe dialogs", () => {
  it("closes the navigation drawer on Escape and restores focus", async () => {
    renderRoute("/app", residentSession());

    const menu = await screen.findByRole("button", {
      name: "Open navigation menu",
    });

    menu.focus();
    fireEvent.click(menu);

    const dialog = await screen.findByRole("dialog", { name: "Menu" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(menu).toHaveFocus();
  });
});

describe("responder shell", () => {
  it("labels its navigation for assistive technology", async () => {
    renderRoute("/responder", responderSession());

    expect(
      await screen.findByRole("navigation", { name: "Primary route navigation" }),
    ).toBeInTheDocument();
  });
});
