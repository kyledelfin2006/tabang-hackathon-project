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

// The decision, the role grant, and clearing the stored paths happen inside
// decide_application; tests/policies/applications.test.mjs covers them. These
// tests cover what the repository does around that call.
describe("decision and evidence deletion", () => {
  function repositoryWith({ decisionError = null, removed } = {}) {
    const calls = [];
    const client = {
      rpc: async (name, args) => (calls.push(["rpc", name, args]), { error: decisionError }),
      storage: {
        from: (bucket) => ({
          remove: async (paths) => {
            calls.push(["remove", bucket, paths]);

            if (removed instanceof Error) {
              throw removed;
            }

            return { data: (removed ?? paths).map((name) => ({ name })), error: null };
          },
        }),
      },
    };

    return { calls, repository: createReviewRepository({ client }) };
  }

  it("records the decision first, then deletes both files", async () => {
    const { calls, repository } = repositoryWith();

    const outcome = await repository.decide({
      application,
      approve: true,
      notes: "Badge verified with the office.",
    });

    expect(outcome).toEqual({ evidenceDeleted: true });
    expect(calls).toEqual([
      [
        "rpc",
        "decide_application",
        { applicant_id: "resident-9", approve: true, notes: "Badge verified with the office." },
      ],
      ["remove", "identity-evidence", ["resident-9/id.jpg", "resident-9/selfie.jpg"]],
    ]);
  });

  it("deletes nothing when the decision is refused", async () => {
    const { calls, repository } = repositoryWith({ decisionError: { message: "forbidden" } });

    await expect(repository.decide({ application, approve: true })).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(calls.filter(([kind]) => kind === "remove")).toEqual([]);
  });

  it("reports a failed deletion without undoing the decision", async () => {
    const partial = repositoryWith({ removed: ["resident-9/id.jpg"] });
    const thrown = repositoryWith({ removed: new Error("offline") });

    await expect(partial.repository.decide({ application, approve: false })).resolves.toEqual({
      evidenceDeleted: false,
    });
    await expect(thrown.repository.decide({ application, approve: false })).resolves.toEqual({
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
