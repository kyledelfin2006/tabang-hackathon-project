import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { createTestRouter } from "../app/router.jsx";
import ResidentHomePage from "../routes/home/ResidentHomePage.jsx";
import {
  ADVISORY_PAGE_SIZE,
  toPublicAdvisory,
} from "../services/advisories/advisoryRepository.js";
import { createFakeAuthGateway, residentSession } from "./fakeAuthGateway.js";

function renderHome(repository) {
  return render(
    <AppProviders authGateway={createFakeAuthGateway({ session: null })}>
      <MemoryRouter>
        <ResidentHomePage advisoryRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

const sampleAdvisory = {
  id: "advisory-1",
  summary: "Floodwater rising near the market road.",
  barangay: "Poblacion",
  kind: "flood",
  createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
};

describe("resident home", () => {
  it("shows a skeleton while advisories load", () => {
    renderHome({ listRecentAdvisories: () => new Promise(() => {}) });

    expect(screen.getByLabelText("Loading advisories")).toBeInTheDocument();
  });

  it("renders sanitized advisories once loaded", async () => {
    renderHome({
      listRecentAdvisories: vi.fn().mockResolvedValue([sampleAdvisory]),
    });

    expect(
      await screen.findByText("Floodwater rising near the market road."),
    ).toBeInTheDocument();
    expect(screen.getByText("Poblacion")).toBeInTheDocument();
  });

  it("shows an empty state rather than inventing advisories", async () => {
    renderHome({ listRecentAdvisories: vi.fn().mockResolvedValue([]) });

    expect(
      await screen.findByText("No advisories right now"),
    ).toBeInTheDocument();
  });

  it("offers a retry after a failed load", async () => {
    const listRecentAdvisories = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([sampleAdvisory]);

    renderHome({ listRecentAdvisories });

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText("Floodwater rising near the market road."),
    ).toBeInTheDocument();
    expect(listRecentAdvisories).toHaveBeenCalledTimes(2);
  });

  it("links quick actions to real routes instead of inline handlers", async () => {
    renderHome({ listRecentAdvisories: vi.fn().mockResolvedValue([]) });

    await screen.findByText("No advisories right now");
    expect(screen.getByRole("link", { name: "Report flood" })).toHaveAttribute(
      "href",
      "/app/reports/new",
    );
    expect(screen.getByRole("link", { name: "Request help" })).toHaveAttribute(
      "href",
      "/app/help/new",
    );
  });
});

describe("advisory projection", () => {
  it("keeps the page size bounded", () => {
    expect(ADVISORY_PAGE_SIZE).toBeLessThanOrEqual(6);
  });

  it("drops every protected field from a feed document", () => {
    const projected = toPublicAdvisory("item-1", {
      summary: "Floodwater rising near the market road.",
      barangay: "Poblacion",
      kind: "flood",
      createdAt: { toMillis: () => 1_755_000_000_000 },
      preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
      contactPhone: "09171234567",
      description: "Private description that must not leak.",
      imagePaths: ["reportUploads/resident-1/report-1/original.jpg"],
      reporterId: "resident-1",
    });

    expect(Object.keys(projected).sort()).toEqual([
      "barangay",
      "createdAtMillis",
      "id",
      "kind",
      "summary",
    ]);
  });

  it("falls back to a safe kind for an unexpected value", () => {
    expect(toPublicAdvisory("item-2", { kind: "responder-only" }).kind).toBe(
      "advisory",
    );
  });
});

describe("resident shell navigation", () => {
  function renderShell() {
    const router = createTestRouter(["/app"]);

    render(
      <AppProviders
        authGateway={createFakeAuthGateway({ session: residentSession() })}
      >
        <RouterProvider router={router} />
      </AppProviders>,
    );

    return router;
  }

  it("opens the drawer, moves focus into it, and closes on Escape", async () => {
    renderShell();

    const menuButton = await screen.findByRole("button", {
      name: "Open navigation menu",
    });

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    // A real browser focuses a button when it is clicked; fireEvent does not,
    // and focus restoration has nothing to restore to without this.
    menuButton.focus();
    fireEvent.click(menuButton);

    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    const closeButton = screen.getByRole("button", { name: "Close" });

    expect(closeButton).toHaveFocus();
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Menu" }),
      ).not.toBeInTheDocument();
    });
    // Focus must return to the control that opened the drawer.
    expect(menuButton).toHaveFocus();
  });

  it("navigates by router link from the drawer", async () => {
    const router = renderShell();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open navigation menu" }),
    );

    // Scope to the drawer: the bottom nav and home page also link to hotlines.
    const dialog = await screen.findByRole("dialog", { name: "Menu" });

    fireEvent.click(within(dialog).getByRole("link", { name: "Hotlines" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/hotlines");
    });
  });

  it("does not render a decorative device status bar", async () => {
    renderShell();

    await screen.findByText("What do you need right now?");
    expect(screen.queryByText("9:41")).not.toBeInTheDocument();
  });
});
