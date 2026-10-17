import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ResponderDashboardPage from "../routes/responder/ResponderDashboardPage.jsx";
import {
  METRIC_DEFINITIONS,
  METRIC_STALE_AFTER_MS,
  isMetricSetStale,
} from "../services/metrics/dashboardMetrics.js";
import { createFakeAuthGateway, responderSession } from "./fakeAuthGateway.js";

const counts = Object.freeze({
  openIncidents: 30,
  unclaimed: 4,
  overdue: 2,
  verified: 11,
  awaitingVerification: 19,
  countedAtMillis: Date.now(),
});

function renderDashboard(repository) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({ session: responderSession() })}
    >
      <MemoryRouter>
        <ResponderDashboardPage incidentRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("metric definitions", () => {
  it("offers no metric the system cannot count", () => {
    const keys = METRIC_DEFINITIONS.map((definition) => definition.key);

    // The legacy dashboard showed these under a "Live" badge with no source.
    expect(keys).not.toContain("peopleAffected");
    expect(keys).not.toContain("familiesEvacuated");
    expect(keys).not.toContain("damageEstimate");
  });

  it("documents a source for every metric", () => {
    for (const definition of METRIC_DEFINITIONS) {
      expect(definition.source).toBeTruthy();
      expect(definition.label).toBeTruthy();
    }
  });
});

describe("staleness", () => {
  it("treats an old count as stale", () => {
    const generated = Date.parse("2026-08-14T02:00:00Z");

    expect(
      isMetricSetStale(generated, generated + METRIC_STALE_AFTER_MS + 1),
    ).toBe(true);
    expect(isMetricSetStale(generated, generated + 1000)).toBe(false);
  });

  it("treats a never-counted set as stale", () => {
    expect(isMetricSetStale(null)).toBe(true);
  });
});

describe("responder dashboard route", () => {
  it("states that nothing is estimated or sampled", async () => {
    renderDashboard({ countIncidents: vi.fn().mockResolvedValue(counts) });

    expect(
      await screen.findByText(/Nothing is estimated, projected, or sampled/),
    ).toBeInTheDocument();
  });

  it("REQ-023: shows the exact database counts with the time they were taken", async () => {
    const countIncidents = vi.fn().mockResolvedValue(counts);

    renderDashboard({ countIncidents });

    await screen.findByText("Open incidents");
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("Counted at")).toBeInTheDocument();
    expect(screen.getByText(/Counted from every open incident/)).toBeInTheDocument();
    expect(countIncidents).toHaveBeenCalledTimes(1);
  });

  it("keeps the dashboard focused on current response data", async () => {
    renderDashboard({ countIncidents: vi.fn().mockResolvedValue(counts) });

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Operational summary",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/previous version/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the incident queue" }),
    ).toHaveAttribute("href", "/responder/incidents");
  });

  it("shows no figures at all when the source fails", async () => {
    renderDashboard({
      countIncidents: vi.fn().mockRejectedValue(new Error("offline")),
    });

    expect(
      await screen.findByText("The summary is unavailable"),
    ).toBeInTheDocument();
    // Falling back to cached or sample numbers would be worse than nothing.
    expect(screen.queryByText("Open incidents")).not.toBeInTheDocument();
  });
});
