import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { createTestRouter } from "../app/router.jsx";
import Modal from "../components/feedback/Modal.jsx";
import ResponderAdvisoriesPage from "../routes/responder/ResponderAdvisoriesPage.jsx";
import ResponderApplicationPage from "../routes/responder/ResponderApplicationPage.jsx";
import ReviewQueuePage from "../routes/responder/ReviewQueuePage.jsx";
import { createAdvisoryRepository } from "../services/advisories/advisoryRepository.js";
import {
  createFakeAuthGateway,
  residentSession,
  responderSession,
} from "./fakeAuthGateway.js";

function renderWith(ui, session = responderSession()) {
  return render(
    <AppProviders authGateway={createFakeAuthGateway({ session })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

const ownAdvisory = {
  id: "advisory-1",
  summary: "Road to the evacuation centre is flooded; use the highway.",
  barangay: "",
  municipality: "Kalibo",
  source: "tabang",
  kind: "advisory",
  published: true,
  createdAtMillis: Date.parse("2026-10-17T08:00:00Z"),
  expiresAtMillis: null,
};

describe("REQ-018: responder advisories", () => {
  function repository(overrides = {}) {
    return {
      listOwnAdvisories: vi.fn().mockResolvedValue([ownAdvisory]),
      publishAdvisory: vi.fn().mockResolvedValue(undefined),
      unpublishAdvisory: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("publishes an advisory with the chosen municipality", async () => {
    const advisories = repository();

    renderWith(<ResponderAdvisoriesPage advisoryRepository={advisories} />);

    fireEvent.change(await screen.findByLabelText("Advisory"), {
      target: { value: "  Bridge   closed until the water drops. " },
    });
    fireEvent.change(screen.getByLabelText("Municipality (optional)"), {
      target: { value: "Numancia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish advisory" }));

    expect(await screen.findByText(/Published\. Residents can see it now/)).toBeInTheDocument();
    expect(advisories.publishAdvisory).toHaveBeenCalledWith({
      summary: "Bridge closed until the water drops.",
      municipality: "Numancia",
      barangay: "",
    });
  });

  it("refuses an empty advisory without publishing", async () => {
    const advisories = repository();

    renderWith(<ResponderAdvisoriesPage advisoryRepository={advisories} />);
    fireEvent.click(await screen.findByRole("button", { name: "Publish advisory" }));

    expect(await screen.findByText("Write at least 10 characters.")).toBeInTheDocument();
    expect(advisories.publishAdvisory).not.toHaveBeenCalled();
  });

  it("unpublishes one of the responder's own advisories", async () => {
    const advisories = repository();

    renderWith(<ResponderAdvisoriesPage advisoryRepository={advisories} />);
    fireEvent.click(await screen.findByRole("button", { name: "Unpublish" }));

    await waitFor(() =>
      expect(advisories.unpublishAdvisory).toHaveBeenCalledWith("advisory-1"),
    );
    expect(advisories.listOwnAdvisories).toHaveBeenCalledWith("resident-1");
  });

  it("writes only the advisory columns, never author or source", async () => {
    const inserted = [];
    const client = {
      from: (table) => ({
        insert: async (row) => (inserted.push([table, row]), { data: null, error: null }),
      }),
    };

    await createAdvisoryRepository({ client }).publishAdvisory({
      summary: "Bridge closed.",
      municipality: "",
      barangay: "",
    });

    expect(inserted).toEqual([
      ["public_feed", {
        kind: "advisory",
        summary: "Bridge closed.",
        municipality: null,
        barangay: null,
      }],
    ]);
  });
});

describe("REQ-026: reviewer evidence", () => {
  const application = {
    id: "resident-9",
    applicantId: "resident-9",
    applicantName: "Maria Santos",
    applicantEmail: "maria@example.test",
    organization: "Aklan MDRRMO",
    badgeNumber: "MD-2291",
    municipality: "Kalibo",
    consentVersion: "2026-04-privacy-and-terms",
    identityDocumentPath: "resident-9/id.jpg",
    selfiePath: "resident-9/selfie.jpg",
    submittedAtMillis: Date.parse("2026-08-14T02:00:00Z"),
  };

  it("shows the applicant and opens evidence through an expiring link", async () => {
    const getEvidenceUrl = vi.fn().mockResolvedValue("https://storage.example/signed-id");

    renderWith(
      <ReviewQueuePage
        reviewRepository={{
          listPendingApplications: vi.fn().mockResolvedValue([application]),
          getEvidenceUrl,
          decide: vi.fn(),
        }}
      />,
      responderSession({ role: "reviewer" }),
    );

    expect(await screen.findByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("maria@example.test")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View ID" }));

    expect(
      await screen.findByRole("link", { name: /Open the ID/ }),
    ).toHaveAttribute("href", "https://storage.example/signed-id");
    expect(getEvidenceUrl).toHaveBeenCalledWith("resident-9/id.jpg");
  });

  it("says when the decision stands but evidence deletion is pending", async () => {
    renderWith(
      <ReviewQueuePage
        reviewRepository={{
          listPendingApplications: vi.fn().mockResolvedValue([application]),
          getEvidenceUrl: vi.fn(),
          decide: vi.fn().mockResolvedValue({ evidenceDeleted: false }),
        }}
      />,
      responderSession({ role: "reviewer" }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject the application" }));

    expect(await screen.findByText(/evidence deletion is pending/)).toBeInTheDocument();
    expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument();
  });
});

describe("REQ-027: responder application", () => {
  it("shows an error with retry instead of an empty form when loading fails", async () => {
    const getMyApplication = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(null);

    renderWith(
      <ResponderApplicationPage applicationRepository={{ getMyApplication }} />,
      residentSession(),
    );

    expect(
      await screen.findByText("Your application could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("button", { name: "Submit application" }),
    ).toBeInTheDocument();
  });

  it("lets a rejected applicant apply again with their details filled in", async () => {
    renderWith(
      <ResponderApplicationPage
        applicationRepository={{
          getMyApplication: vi.fn().mockResolvedValue({
            status: "rejected",
            organization: "Aklan MDRRMO",
            badgeNumber: "MD-2291",
            municipality: "Kalibo",
            reviewNotes: "The ID photo is unreadable.",
            submittedAtMillis: null,
          }),
        }}
      />,
      residentSession(),
    );

    expect(await screen.findByText(/The ID photo is unreadable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply again" }));

    expect(screen.getByLabelText("Organization")).toHaveValue("Aklan MDRRMO");
    expect(screen.getByLabelText("Badge or employee number")).toHaveValue("MD-2291");
    expect(screen.getByRole("button", { name: "Submit application" })).toBeInTheDocument();
  });
});

describe("REQ-025: moving between workspaces", () => {
  it("links a responder from the responder shell to resident features", async () => {
    const router = createTestRouter(["/responder"]);

    render(
      <AppProviders authGateway={createFakeAuthGateway({ session: responderSession() })}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("link", { name: /Resident features/ }),
    ).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Advisories" })).toHaveAttribute(
      "href",
      "/responder/advisories",
    );
  });

  it("offers the responder workspace in the resident menu to responders only", async () => {
    for (const [session, expected] of [
      [responderSession(), true],
      [residentSession(), false],
    ]) {
      const router = createTestRouter(["/app"]);
      const { unmount } = render(
        <AppProviders authGateway={createFakeAuthGateway({ session })}>
          <RouterProvider router={router} />
        </AppProviders>,
      );

      fireEvent.click(
        await screen.findByRole("button", { name: "Open navigation menu" }),
      );

      expect(
        Boolean(screen.queryByRole("link", { name: "Responder workspace" })),
      ).toBe(expected);
      unmount();
    }
  });
});

describe("REQ-031: modal keeps focus inside", () => {
  it("wraps Tab and Shift+Tab within the dialog", async () => {
    render(
      <>
        <button type="button">Behind the dialog</button>
        <Modal
          confirmLabel="Confirm"
          description="Check before confirming."
          onClose={() => {}}
          onConfirm={() => {}}
          open
          title="Are you sure?"
        />
      </>,
    );

    const back = screen.getByRole("button", { name: "Go back" });
    const confirm = screen.getByRole("button", { name: "Confirm" });

    await act(async () => {});
    expect(back).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(back).toHaveFocus();

    fireEvent.keyDown(back, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });
});
