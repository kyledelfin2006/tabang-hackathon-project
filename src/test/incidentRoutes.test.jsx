import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import IncidentQueuePage from "../routes/responder/IncidentQueuePage.jsx";
import IncidentDetailPage from "../routes/responder/IncidentDetailPage.jsx";
import { createFakeAuthGateway, responderSession } from "./fakeAuthGateway.js";

const openIncident = {
  id: "report-1",
  kind: "flood",
  incidentStatus: "new",
  verificationStatus: "pending",
  publicLocationLabel: "Poblacion, Kalibo",
  municipality: "Kalibo",
  barangay: "Poblacion",
  landmark: "Beside the market",
  description: "Water is knee deep on the market road.",
  contactPhone: "09171234567",
  preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
  severity: "knee",
  imagePaths: [],
  assignedResponderIds: [],
  createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
  acknowledgedAtMillis: null,
  isOverdue: true,
  waitingFor: "42 min",
  isClaimed: false,
};

// The fake session's user is "resident-1" with the responder role.
const claimedByMe = {
  ...openIncident,
  incidentStatus: "acknowledged",
  assignedResponderIds: ["resident-1"],
  isClaimed: true,
  isOverdue: false,
};

function page(incidents, { cursor = null, hasMore = false } = {}) {
  return { incidents, cursor, hasMore };
}

function functionError(code) {
  const error = new Error(`Data request failed: ${code}`);

  error.code = code;

  return error;
}

function renderQueue(repository) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({ session: responderSession() })}
    >
      <MemoryRouter>
        <IncidentQueuePage incidentRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

function renderDetail(repository) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({ session: responderSession() })}
    >
      <MemoryRouter initialEntries={["/responder/incidents/report-1"]}>
        <Routes>
          <Route
            element={<IncidentDetailPage incidentRepository={repository} />}
            path="/responder/incidents/:id"
          />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

function detailRepository(incident, overrides = {}) {
  return {
    getIncident: vi.fn().mockResolvedValue(incident),
    listEvents: vi.fn().mockResolvedValue([]),
    getPhotoUrls: vi.fn().mockResolvedValue([]),
    transitionIncident: vi.fn().mockResolvedValue(undefined),
    verifyIncident: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("incident queue route", () => {
  it("surfaces overdue incidents prominently", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue(page([openIncident])),
      claimIncident: vi.fn(),
    });

    expect(await screen.findByText("Overdue")).toBeInTheDocument();
    expect(
      screen.getByText(/passed the\s+15 minute acknowledgement target/),
    ).toBeInTheDocument();
  });

  it("says plainly that nothing escalates by itself", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue(page([])),
      claimIncident: vi.fn(),
    });

    expect(
      await screen.findByText(/Nothing escalates on its own/),
    ).toBeInTheDocument();
  });

  it("passes the chosen filters to the query", async () => {
    const listIncidents = vi.fn().mockResolvedValue(page([]));

    renderQueue({ listIncidents, claimIncident: vi.fn() });

    await screen.findByText("Nothing in this view");
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "help" },
    });

    await waitFor(() => {
      expect(listIncidents).toHaveBeenLastCalledWith({
        status: "open",
        kind: "help",
      });
    });
  });

  it("REQ-023: pages to every open incident with Load more", async () => {
    const cursor = { createdAt: "2026-08-14T02:00:00+00:00", id: "report-25" };
    const first = Array.from({ length: 25 }, (_, index) => ({
      ...openIncident,
      id: `report-${index + 1}`,
      description: `Incident number ${index + 1}`,
    }));
    const rest = Array.from({ length: 5 }, (_, index) => ({
      ...openIncident,
      id: `report-${index + 26}`,
      description: `Incident number ${index + 26}`,
    }));
    const listIncidents = vi
      .fn()
      .mockResolvedValueOnce(page(first, { cursor, hasMore: true }))
      .mockResolvedValueOnce(page(rest));

    renderQueue({ listIncidents, claimIncident: vi.fn() });

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more incidents" }),
    );

    expect(await screen.findByText("Incident number 30")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open incident" })).toHaveLength(30);
    expect(listIncidents).toHaveBeenLastCalledWith({
      status: "open",
      kind: "all",
      cursor,
    });
    expect(
      screen.queryByRole("button", { name: "Load more incidents" }),
    ).not.toBeInTheDocument();
  });

  it("tells a responder who lost a race that somebody else holds it", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue(page([openIncident])),
      claimIncident: vi.fn().mockRejectedValue(functionError("already_claimed")),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another responder has already claimed this incident.",
    );
  });

  it("offers no claim button on an incident somebody already holds", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue(
        page([{ ...claimedByMe, assignedResponderIds: ["responder-9"] }]),
      ),
      claimIncident: vi.fn(),
    });

    await screen.findByText("Acknowledged");
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });
});

describe("incident detail route", () => {
  it("offers only the transitions the lifecycle allows", async () => {
    renderDetail(detailRepository(claimedByMe));

    expect(
      await screen.findByRole("button", { name: "Mark dispatched" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeInTheDocument();
    // on_scene is not reachable from acknowledged.
    expect(
      screen.queryByRole("button", { name: "Mark on scene" }),
    ).not.toBeInTheDocument();
  });

  it("REQ-022: acknowledging a new incident is offered as a claim", async () => {
    const repository = detailRepository(openIncident);

    renderDetail(repository);
    fireEvent.click(
      await screen.findByRole("button", { name: "Acknowledge and claim" }),
    );

    await waitFor(() =>
      expect(repository.transitionIncident).toHaveBeenCalledWith({
        incidentId: "report-1",
        toStatus: "acknowledged",
        note: "",
      }),
    );
  });

  it("offers no transitions once an incident is closed", async () => {
    renderDetail(detailRepository({ ...claimedByMe, incidentStatus: "resolved" }));

    expect(
      await screen.findByText(/closed. Its history is kept/),
    ).toBeInTheDocument();
  });

  it("sends the note with a transition", async () => {
    const repository = detailRepository({ ...claimedByMe, incidentStatus: "dispatched" });

    renderDetail(repository);
    fireEvent.change(await screen.findByLabelText("Note (optional)"), {
      target: { value: "Family moved to the covered court." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));

    await waitFor(() => {
      expect(repository.transitionIncident).toHaveBeenCalledWith({
        incidentId: "report-1",
        toStatus: "resolved",
        note: "Family moved to the covered court.",
      });
    });
  });

  it("REQ-019: the assigned responder can verify or reject", async () => {
    const repository = detailRepository(claimedByMe);

    renderDetail(repository);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(repository.verifyIncident).toHaveBeenCalledWith({
        incidentId: "report-1",
        verificationStatus: "rejected",
      }),
    );
  });

  it("does not offer verification to a responder who does not hold it", async () => {
    renderDetail(
      detailRepository({ ...claimedByMe, assignedResponderIds: ["responder-9"] }),
    );

    await screen.findByText("Water is knee deep on the market road.");
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("shows a readable refusal instead of a provider message", async () => {
    renderDetail(
      detailRepository(claimedByMe, {
        transitionIncident: vi
          .fn()
          .mockRejectedValue(functionError("invalid_transition")),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Mark dispatched" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That change is no longer possible. Refresh to see the latest status.",
    );
  });

  it("REQ-024: shows photos, a map link, and readable labels", async () => {
    const repository = detailRepository(
      { ...claimedByMe, imagePaths: ["resident-1/report-1/a.jpg"] },
      {
        getPhotoUrls: vi
          .fn()
          .mockResolvedValue(["https://storage.example/signed-a"]),
      },
    );

    renderDetail(repository);

    expect(
      await screen.findByRole("img", { name: "Photo 1 sent with the report" }),
    ).toHaveAttribute("src", "https://storage.example/signed-a");
    expect(repository.getPhotoUrls).toHaveBeenCalledWith(["resident-1/report-1/a.jpg"]);
    expect(
      screen.getByRole("link", { name: "Open the reported location in Google Maps" }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=11.7061,122.3648",
    );
    expect(screen.getByText("Knee deep")).toBeInTheDocument();
    expect(screen.getByText("Not yet verified")).toBeInTheDocument();
    expect(screen.getByText(/near Beside the market/)).toBeInTheDocument();
  });

  it("REQ-010: shows 'Photo unavailable' when a photo fails to load", async () => {
    const repository = detailRepository(
      { ...claimedByMe, imagePaths: ["resident-1/report-1/missing.jpg"] },
      {
        getPhotoUrls: vi
          .fn()
          .mockResolvedValue(["/api/app/files/report-photos/resident-1/report-1/missing.jpg"]),
      },
    );

    renderDetail(repository);

    const img = await screen.findByRole("img", { name: "Photo 1 sent with the report" });
    fireEvent.error(img);

    expect(await screen.findByText("Photo unavailable")).toBeInTheDocument();
  });

  it("renders the history with readable status and role labels", async () => {
    renderDetail(
      detailRepository(openIncident, {
        listEvents: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            type: "status-change",
            fromStatus: "new",
            toStatus: "acknowledged",
            actorId: "responder-5",
            actorRole: "responder",
            note: "Claimed and acknowledged.",
            createdAtMillis: Date.parse("2026-08-14T02:10:00Z"),
          },
        ]),
      }),
    );

    expect(
      await screen.findByText("Unclaimed to Acknowledged"),
    ).toBeInTheDocument();
    expect(screen.getByText("Claimed and acknowledged.")).toBeInTheDocument();
    expect(screen.getAllByText("Responder").length).toBeGreaterThan(0);
  });

  it("shows a missing incident without leaking anything", async () => {
    renderDetail(detailRepository(null));

    expect(
      await screen.findByText("That incident is not available"),
    ).toBeInTheDocument();
  });
});
