import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import CommunityFeedPage from "../routes/community/CommunityFeedPage.jsx";
import MyReportsPage from "../routes/reports/MyReportsPage.jsx";
import {
  REPORT_PAGE_SIZE,
  buildMyReportsQuerySpec,
  createReportRepository,
  toPersonalReport,
} from "../services/reports/reportRepository.js";
import { createFakeAuthGateway, residentSession } from "./fakeAuthGateway.js";

function renderWithProviders(ui) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({ session: residentSession() })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

const personalReport = {
  id: "report-1",
  kind: "flood",
  publicLocationLabel: "Poblacion, Kalibo",
  description: "Water is knee deep outside our gate at 42 Rizal Street.",
  verificationStatus: "pending",
  incidentStatus: "new",
  createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
  isCancelled: false,
  isStale: false,
};

const publicAdvisory = {
  id: "advisory-1",
  summary: "Flooding reported in Poblacion (knee-deep).",
  barangay: "Poblacion",
  kind: "flood",
  createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
};

describe("personal report projection", () => {
  it("keeps the page size bounded", () => {
    expect(REPORT_PAGE_SIZE).toBeLessThanOrEqual(10);
  });

  it("never exposes another resident's contact details through the projection", () => {
    const projected = toPersonalReport("report-1", {
      kind: "flood",
      publicLocationLabel: "Poblacion",
      description: "Private description",
      contactPhone: "09171234567",
      preciseLocation: { latitude: 11.7, longitude: 122.3 },
      reporterId: "resident-1",
      incidentStatus: "new",
      verificationStatus: "pending",
    });

    expect(projected.contactPhone).toBeUndefined();
    expect(projected.preciseLocation).toBeUndefined();
    expect(projected.reporterId).toBeUndefined();
  });
});

describe("owner-scoped pagination", () => {
  function repositoryOver(documents) {
    const specs = [];

    return {
      specs,
      repository: createReportRepository({
        db: {},
        // Bypasses Firestore query construction; the spec below is what the
        // real builder consumes, so this asserts the same contract.
        queryBuilder: (_db, spec) => {
          specs.push(spec);

          return spec;
        },
        runQuery: async () => ({
          docs: documents.map((document) => ({
            id: document.id,
            data: () => document,
          })),
        }),
      }),
    };
  }

  it("filters by owner and orders deterministically", () => {
    const spec = buildMyReportsQuerySpec({ reporterId: "resident-1" });

    expect(spec.reporterId).toBe("resident-1");
    // A tie on createdAt must still have a stable order.
    expect(spec.orderBy).toEqual([
      ["createdAt", "desc"],
      ["__name__", "desc"],
    ]);
  });

  it("caps the page size however large a caller asks for", () => {
    expect(buildMyReportsQuerySpec({ reporterId: "r", pageSize: 500 }).limit).toBe(
      REPORT_PAGE_SIZE,
    );
    expect(buildMyReportsQuerySpec({ reporterId: "r", pageSize: 0 }).limit).toBe(1);
    expect(buildMyReportsQuerySpec({ reporterId: "r" }).limit).toBe(
      REPORT_PAGE_SIZE,
    );
  });

  it("passes a cursor through only when one is supplied", () => {
    expect(buildMyReportsQuerySpec({ reporterId: "r" }).cursor).toBeNull();
    expect(
      buildMyReportsQuerySpec({ reporterId: "r", cursor: "doc-9" }).cursor,
    ).toBe("doc-9");
  });

  it("returns a cursor and a hasMore flag from a full page", async () => {
    const documents = Array.from({ length: REPORT_PAGE_SIZE }, (_, index) => ({
      id: `report-${index}`,
      kind: "flood",
      incidentStatus: "new",
      verificationStatus: "pending",
    }));
    const { repository, specs } = repositoryOver(documents);
    const page = await repository.listMyReports({ reporterId: "resident-1" });

    expect(page.reports).toHaveLength(REPORT_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.cursor).not.toBeNull();
    expect(specs[0].reporterId).toBe("resident-1");
  });

  it("reports no further pages when the page is short", async () => {
    const { repository } = repositoryOver([
      { id: "report-1", kind: "flood", incidentStatus: "new" },
    ]);
    const page = await repository.listMyReports({ reporterId: "resident-1" });

    expect(page.hasMore).toBe(false);
    expect(page.cursor).not.toBeNull();
  });

  it("never asks Firestore for more than one page worth of documents", async () => {
    const { repository, specs } = repositoryOver([]);

    await repository.listMyReports({ reporterId: "resident-1", pageSize: 500 });

    expect(specs[0].limit).toBe(REPORT_PAGE_SIZE);
  });
});

describe("my reports route", () => {
  it("shows an empty state instead of another resident's data", async () => {
    renderWithProviders(
      <MyReportsPage
        reportRepository={{
          listMyReports: vi
            .fn()
            .mockResolvedValue({ reports: [], cursor: null, hasMore: false }),
          cancelReport: vi.fn(),
        }}
      />,
    );

    expect(
      await screen.findByText("You have not filed any reports"),
    ).toBeInTheDocument();
  });

  it("queries only for the signed-in resident", async () => {
    const listMyReports = vi
      .fn()
      .mockResolvedValue({ reports: [], cursor: null, hasMore: false });

    renderWithProviders(
      <MyReportsPage reportRepository={{ listMyReports, cancelReport: vi.fn() }} />,
    );

    await screen.findByText("You have not filed any reports");
    expect(listMyReports).toHaveBeenCalledWith({ reporterId: "resident-1" });
  });

  it("cancels only after an explicit confirmation", async () => {
    const cancelReport = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <MyReportsPage
        reportRepository={{
          listMyReports: vi.fn().mockResolvedValue({
            reports: [personalReport],
            cursor: null,
            hasMore: false,
          }),
          cancelReport,
        }}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel this report" }),
    );

    // Dismissing the dialog must not perform the destructive action.
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(cancelReport).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel this report" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel the report" }));

    expect(cancelReport).toHaveBeenCalledWith({ reportId: "report-1" });
  });
});

describe("community feed route", () => {
  it("renders only sanitized public fields", async () => {
    renderWithProviders(
      <CommunityFeedPage
        advisoryRepository={{
          listRecentAdvisories: vi.fn().mockResolvedValue([publicAdvisory]),
        }}
      />,
    );

    expect(
      await screen.findByText("Flooding reported in Poblacion (knee-deep)."),
    ).toBeInTheDocument();
  });

  it("cannot display a description, phone number, or coordinates", async () => {
    // A deliberately over-broad document: the public variant has no branch
    // that renders any of these fields, so none may reach the DOM.
    renderWithProviders(
      <CommunityFeedPage
        advisoryRepository={{
          listRecentAdvisories: vi.fn().mockResolvedValue([
            {
              ...publicAdvisory,
              description: "Private description that must not leak.",
              contactPhone: "09171234567",
              preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
            },
          ]),
        }}
      />,
    );

    await screen.findByText("Flooding reported in Poblacion (knee-deep).");
    expect(document.body.textContent).not.toContain("09171234567");
    expect(document.body.textContent).not.toContain("11.7061");
    expect(document.body.textContent).not.toContain(
      "Private description that must not leak.",
    );
  });

  it("explains that individual reports are not listed automatically", async () => {
    renderWithProviders(
      <CommunityFeedPage
        advisoryRepository={{
          listRecentAdvisories: vi.fn().mockResolvedValue([]),
        }}
      />,
    );

    expect(
      await screen.findByText("No advisories published yet"),
    ).toBeInTheDocument();
  });
});
