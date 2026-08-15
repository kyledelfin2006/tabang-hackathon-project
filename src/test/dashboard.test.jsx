import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ResponderDashboardPage from "../routes/responder/ResponderDashboardPage.jsx";
import {
  METRIC_DEFINITIONS,
  METRIC_STALE_AFTER_MS,
  computeMetrics,
  describeCoverage,
  isMetricSetStale,
} from "../services/metrics/dashboardMetrics.js";
import { createFakeAuthGateway, responderSession } from "./fakeAuthGateway.js";

function incident(overrides = {}) {
  return {
    id: "report-1",
    incidentStatus: "new",
    verificationStatus: "pending",
    isClaimed: false,
    isOverdue: false,
    createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
    ...overrides,
  };
}

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

describe("metric computation", () => {
  it("counts only open incidents", () => {
    const { values } = computeMetrics([
      incident({ id: "a" }),
      incident({ id: "b", incidentStatus: "resolved" }),
      incident({ id: "c", incidentStatus: "cancelled" }),
    ]);

    expect(values.openIncidents).toBe(1);
  });

  it("separates verified from unverified incidents", () => {
    const { values } = computeMetrics([
      incident({ id: "a", verificationStatus: "verified" }),
      incident({ id: "b", verificationStatus: "pending" }),
    ]);

    expect(values.verified).toBe(1);
    expect(values.awaitingVerification).toBe(1);
  });

  it("counts unclaimed and overdue separately", () => {
    const { values } = computeMetrics([
      incident({ id: "a", isClaimed: true }),
      incident({ id: "b", isOverdue: true }),
    ]);

    expect(values.unclaimed).toBe(1);
    expect(values.overdue).toBe(1);
  });

  it("marks the set truncated when the page was filled", () => {
    const incidents = Array.from({ length: 5 }, (_, index) =>
      incident({ id: `report-${index}` }),
    );

    expect(computeMetrics(incidents, { pageLimit: 5 }).truncated).toBe(true);
    expect(computeMetrics(incidents, { pageLimit: 10 }).truncated).toBe(false);
  });

  it("says plainly when the numbers are not totals", () => {
    expect(describeCoverage({ truncated: true, pageLimit: 25 })).toMatch(
      /not totals/,
    );
    expect(describeCoverage({ truncated: false })).toMatch(/every open incident/);
  });

  it("records when it counted", () => {
    const now = Date.parse("2026-08-14T03:00:00Z");

    expect(computeMetrics([], { now }).generatedAtMillis).toBe(now);
  });
});

describe("staleness", () => {
  it("treats an old count as stale", () => {
    const generated = Date.parse("2026-08-14T02:00:00Z");

    expect(isMetricSetStale(generated, generated + METRIC_STALE_AFTER_MS + 1)).toBe(
      true,
    );
    expect(isMetricSetStale(generated, generated + 1000)).toBe(false);
  });

  it("treats a never-counted set as stale", () => {
    expect(isMetricSetStale(null)).toBe(true);
  });
});

describe("responder dashboard route", () => {
  it("states that nothing is estimated or sampled", async () => {
    renderDashboard({ listIncidents: vi.fn().mockResolvedValue([]) });

    expect(
      await screen.findByText(/Nothing is estimated, projected, or sampled/),
    ).toBeInTheDocument();
  });

  it("shows counts with the time they were taken", async () => {
    renderDashboard({
      listIncidents: vi
        .fn()
        .mockResolvedValue([incident({ id: "a" }), incident({ id: "b" })]),
    });

    await screen.findByText("Open incidents");
    expect(screen.getByText("Counted at")).toBeInTheDocument();
    expect(screen.getByText("Coverage")).toBeInTheDocument();
  });

  it("explains which figures it deliberately cannot provide", async () => {
    renderDashboard({ listIncidents: vi.fn().mockResolvedValue([]) });

    expect(
      await screen.findByText("No population or evacuation figures"),
    ).toBeInTheDocument();
  });

  it("shows no figures at all when the source fails", async () => {
    renderDashboard({
      listIncidents: vi.fn().mockRejectedValue(new Error("offline")),
    });

    expect(
      await screen.findByText("The summary is unavailable"),
    ).toBeInTheDocument();
    // Falling back to cached or sample numbers would be worse than nothing.
    expect(screen.queryByText("Open incidents")).not.toBeInTheDocument();
  });
});
