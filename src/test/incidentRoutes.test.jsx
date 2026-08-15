import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import IncidentQueuePage from "../routes/responder/IncidentQueuePage.jsx";
import IncidentDetailPage from "../routes/responder/IncidentDetailPage.jsx";
import { AlreadyClaimedError } from "../services/incidents/incidentRepository.js";
import { createFakeAuthGateway, responderSession } from "./fakeAuthGateway.js";

const openIncident = {
  id: "report-1",
  kind: "flood",
  incidentStatus: "new",
  publicLocationLabel: "Poblacion, Kalibo",
  description: "Water is knee deep on the market road.",
  contactPhone: "09171234567",
  preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
  assignedResponderIds: [],
  createdAtMillis: Date.parse("2026-08-14T02:00:00Z"),
  acknowledgedAtMillis: null,
  isOverdue: true,
  waitingFor: "42 min",
  isClaimed: false,
};

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

describe("incident queue route", () => {
  it("surfaces overdue incidents prominently", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue([openIncident]),
      claimIncident: vi.fn(),
    });

    expect(await screen.findByText("Overdue")).toBeInTheDocument();
    expect(
      screen.getByText(/passed the\s+15 minute acknowledgement target/),
    ).toBeInTheDocument();
  });

  it("says plainly that nothing escalates by itself", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue([]),
      claimIncident: vi.fn(),
    });

    expect(
      await screen.findByText(/Nothing escalates on its own/),
    ).toBeInTheDocument();
  });

  it("passes the chosen filters to the query", async () => {
    const listIncidents = vi.fn().mockResolvedValue([]);

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

  it("tells a responder who lost a race that somebody else holds it", async () => {
    const claimIncident = vi
      .fn()
      .mockRejectedValue(
        new AlreadyClaimedError(
          "Another responder has already claimed this incident.",
        ),
      );

    renderQueue({
      listIncidents: vi.fn().mockResolvedValue([openIncident]),
      claimIncident,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another responder has already claimed this incident.",
    );
  });

  it("offers no claim button on an incident somebody already holds", async () => {
    renderQueue({
      listIncidents: vi.fn().mockResolvedValue([
        {
          ...openIncident,
          incidentStatus: "acknowledged",
          assignedResponderIds: ["responder-9"],
          isClaimed: true,
          isOverdue: false,
        },
      ]),
      claimIncident: vi.fn(),
    });

    await screen.findByText("Acknowledged");
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });
});

describe("incident detail route", () => {
  it("offers only the transitions the lifecycle allows", async () => {
    renderDetail({
      getIncident: vi.fn().mockResolvedValue({
        ...openIncident,
        incidentStatus: "acknowledged",
      }),
      listEvents: vi.fn().mockResolvedValue([]),
      transitionIncident: vi.fn(),
    });

    expect(
      await screen.findByRole("button", { name: "Mark dispatched" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark resolved" }),
    ).toBeInTheDocument();
    // on_scene is not reachable from acknowledged.
    expect(
      screen.queryByRole("button", { name: "Mark on scene" }),
    ).not.toBeInTheDocument();
  });

  it("offers no transitions once an incident is closed", async () => {
    renderDetail({
      getIncident: vi.fn().mockResolvedValue({
        ...openIncident,
        incidentStatus: "resolved",
      }),
      listEvents: vi.fn().mockResolvedValue([]),
      transitionIncident: vi.fn(),
    });

    expect(
      await screen.findByText(/closed. Its history is kept/),
    ).toBeInTheDocument();
  });

  it("sends the note and the acting responder with a transition", async () => {
    const transitionIncident = vi.fn().mockResolvedValue(undefined);

    renderDetail({
      getIncident: vi.fn().mockResolvedValue({
        ...openIncident,
        incidentStatus: "dispatched",
      }),
      listEvents: vi.fn().mockResolvedValue([]),
      transitionIncident,
    });

    fireEvent.change(await screen.findByLabelText("Note (optional)"), {
      target: { value: "Family moved to the covered court." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));

    await waitFor(() => {
      expect(transitionIncident).toHaveBeenCalledWith({
        incidentId: "report-1",
        toStatus: "resolved",
        actorId: "resident-1",
        actorRole: "responder",
        note: "Family moved to the covered court.",
      });
    });
  });

  it("renders the append-only history with actor and time", async () => {
    renderDetail({
      getIncident: vi.fn().mockResolvedValue(openIncident),
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
      transitionIncident: vi.fn(),
    });

    expect(await screen.findByText("new → acknowledged")).toBeInTheDocument();
    expect(screen.getByText("Claimed and acknowledged.")).toBeInTheDocument();
  });

  it("shows a missing incident without leaking anything", async () => {
    renderDetail({
      getIncident: vi.fn().mockResolvedValue(null),
      listEvents: vi.fn().mockResolvedValue([]),
      transitionIncident: vi.fn(),
    });

    expect(
      await screen.findByText("That incident is not available"),
    ).toBeInTheDocument();
  });
});
