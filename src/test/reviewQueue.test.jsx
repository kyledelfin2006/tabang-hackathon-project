import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ReviewQueuePage from "../routes/responder/ReviewQueuePage.jsx";
import { createReviewRepository } from "../services/responders/reviewRepository.js";
import { buildDestroyParams } from "../../scripts/uploads/cloudinarySignature.mjs";
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
  consentVersion: "2026-04-privacy-and-terms",
  identityDocumentPath: "tabang/responder-applications/resident-9/id",
  selfiePath: "tabang/responder-applications/resident-9/selfie",
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

describe("evidence destruction parameters", () => {
  it("refuses to destroy anything outside the identity folder", () => {
    expect(() =>
      buildDestroyParams({
        publicId: "tabang/reports/resident-1/photo",
        timestampSeconds: 1,
      }),
    ).toThrow(/identity evidence/);
  });

  it("targets the authenticated delivery type", () => {
    const params = buildDestroyParams({
      publicId: "tabang/responder-applications/resident-9/id",
      timestampSeconds: 1,
    });

    expect(params.type).toBe("authenticated");
  });
});

describe("decision transaction", () => {
  function repositoryWithStores() {
    const applications = new Map([["responderApplications/resident-9", {}]]);
    const roles = new Map();
    const deleted = [];

    const transaction = {
      update: (reference, data) =>
        applications.set(reference.path, {
          ...applications.get(reference.path),
          ...data,
        }),
      set: (reference, data) => roles.set(reference.path, data),
    };

    return {
      applications,
      roles,
      deleted,
      repository: createReviewRepository({
        db: {},
        auth: { currentUser: { getIdToken: async () => "token" } },
        documentRef: (_db, collectionName, id) => ({
          path: `${collectionName}/${id}`,
        }),
        transactionRunner: (_db, work) => work(transaction),
        deleteEvidence: async (publicId) => {
          if (publicId) {
            deleted.push(publicId);
          }
        },
      }),
    };
  }

  it("grants the role and records who decided, in one transaction", async () => {
    const { applications, roles, repository } = repositoryWithStores();

    await repository.decide({
      application,
      approve: true,
      notes: "Badge verified with the office.",
      reviewerId: "reviewer-1",
    });

    const stored = applications.get("responderApplications/resident-9");

    expect(stored.status).toBe("approved");
    expect(stored.reviewedBy).toBe("reviewer-1");
    expect(stored.reviewNotes).toBe("Badge verified with the office.");

    const grant = roles.get("roleAssignments/resident-9");

    expect(grant.role).toBe("responder");
    expect(grant.assignedBy).toBe("reviewer-1");
  });

  it("grants nothing when an application is rejected", async () => {
    const { applications, roles, repository } = repositoryWithStores();

    await repository.decide({
      application,
      approve: false,
      notes: "Could not confirm the badge number.",
      reviewerId: "reviewer-1",
    });

    expect(applications.get("responderApplications/resident-9").status).toBe(
      "rejected",
    );
    expect(roles.size).toBe(0);
  });

  it("deletes both documents and clears their stored paths", async () => {
    const { applications, deleted, repository } = repositoryWithStores();

    await repository.decide({
      application,
      approve: true,
      reviewerId: "reviewer-1",
    });

    expect(deleted).toEqual([
      "tabang/responder-applications/resident-9/id",
      "tabang/responder-applications/resident-9/selfie",
    ]);

    const stored = applications.get("responderApplications/resident-9");

    expect(stored.identityDocumentPath).toBeNull();
    expect(stored.selfiePath).toBeNull();
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
    const decide = vi.fn().mockResolvedValue(undefined);

    renderQueue({
      listPendingApplications: vi.fn().mockResolvedValue([application]),
      decide,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(decide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and grant access" }),
    );

    await waitFor(() => {
      expect(decide).toHaveBeenCalledTimes(1);
    });
    expect(decide.mock.calls[0][0].reviewerId).toBe("resident-1");
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
