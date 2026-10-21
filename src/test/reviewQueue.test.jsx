import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ReviewQueuePage from "../routes/responder/ReviewQueuePage.jsx";
import { createReviewRepository } from "../services/responders/reviewRepository.js";
import {
  createFakeAuthGateway,
  responderSession,
} from "./fakeAuthGateway.js";

const application = {
  id: "resident-9",
  applicantId: "resident-9",
  organization: "Aklan MDRRMO",
  badgeNumber: "MD-2291",
  municipality: "Kalibo",
  applicantName: "Maria Santos",
  applicantEmail: "maria@example.test",
  consentVersion: "2026-04-privacy-and-terms",
  identityDocumentPath: "resident-9/id.jpg",
  selfiePath: "resident-9/selfie.jpg",
  submittedAtMillis: Date.parse("2026-08-14T02:00:00Z"),
};

function renderQueue(repository) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({
        session: responderSession({ role: "reviewer" }),
      })}
    >
      <MemoryRouter>
        <ReviewQueuePage reviewRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

// The decision, role grant, and file deletion happen on the server;
// tests/integration/appApplications.test.mjs covers them. These tests cover
// what the repository does around that call.
describe("decision and evidence deletion", () => {
  function repositoryWith({ decisionError = null, evidenceDeleted = true } = {}) {
    const calls = [];
    const client = {
      post: async (path, body) => {
        calls.push(["post", path, body]);
        if (decisionError) {
          const err = new Error(decisionError.message || "forbidden");
          err.code = decisionError.code || "forbidden";
          throw err;
        }
        return { ok: true, evidenceDeleted };
      },
    };

    return { calls, repository: createReviewRepository({ client }) };
  }

  it("records the decision first, then returns evidenceDeleted", async () => {
    const { calls, repository } = repositoryWith();

    const outcome = await repository.decide({
      application,
      approve: true,
      notes: "Badge verified with the office.",
    });

    expect(outcome).toEqual({ evidenceDeleted: true });
    expect(calls).toEqual([
      [
        "post",
        "/api/app/applications/resident-9/decision",
        { approve: true, notes: "Badge verified with the office." },
      ],
    ]);
  });

  it("deletes nothing when the decision is refused", async () => {
    const { repository } = repositoryWith({ decisionError: { message: "forbidden", code: "forbidden" } });

    await expect(repository.decide({ application, approve: true })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("reports a failed deletion without undoing the decision", async () => {
    const failed = repositoryWith({ evidenceDeleted: false });

    await expect(failed.repository.decide({ application, approve: false })).resolves.toEqual({
      evidenceDeleted: false,
    });
  });
});

describe("review queue route", () => {
  it("warns that approving grants access and deletes documents", async () => {
    renderQueue({
      listPendingApplications: vi.fn().mockResolvedValue([application]),
      decide: vi.fn(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      screen.getByText(/grants responder access immediately and deletes/),
    ).toBeInTheDocument();
  });

  it("decides only after confirmation", async () => {
    const decide = vi.fn().mockResolvedValue({ evidenceDeleted: true });

    renderQueue({
      listPendingApplications: vi.fn().mockResolvedValue([application]),
      decide,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(decide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText("Notes for the record (optional)"), {
      target: { value: "Badge confirmed by phone." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and grant access" }),
    );

    await waitFor(() => {
      expect(decide).toHaveBeenCalledTimes(1);
    });
    expect(decide.mock.calls[0][0]).toMatchObject({
      approve: true,
      notes: "Badge confirmed by phone.",
    });
    expect(
      await screen.findByText(/Decision recorded for Maria Santos/),
    ).toBeInTheDocument();
  });

  it("keeps the application listed when the decision fails", async () => {
    renderQueue({
      listPendingApplications: vi.fn().mockResolvedValue([application]),
      decide: vi.fn().mockRejectedValue(new Error("offline")),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reject the application" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nothing was changed",
    );
    expect(screen.getByText("Aklan MDRRMO")).toBeInTheDocument();
  });

  it("shows an empty queue rather than inventing applications", async () => {
    renderQueue({
      listPendingApplications: vi.fn().mockResolvedValue([]),
      decide: vi.fn(),
    });

    expect(
      await screen.findByText("No applications waiting"),
    ).toBeInTheDocument();
  });
});
