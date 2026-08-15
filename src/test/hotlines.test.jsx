import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import HotlineDirectoryPage from "../routes/hotlines/HotlineDirectoryPage.jsx";
import {
  MAX_COMMENT_LENGTH,
  VERIFICATION_STALE_AFTER_MS,
  createHotlineRepository,
  toHotline,
  validateReview,
} from "../services/hotlines/hotlineRepository.js";
import { createFakeAuthGateway, residentSession } from "./fakeAuthGateway.js";

const verifiedRaw = {
  organization: "Aklan Provincial DRRM Office",
  coverageArea: "Province of Aklan",
  phoneNumbers: ["(036) 262-4979"],
  verified: true,
  verifiedAt: { toMillis: () => Date.parse("2026-08-01T00:00:00Z") },
  verifiedBy: "MDRRMO Kalibo",
  ratingCount: 4,
  ratingTotal: 16,
};

function renderDirectory(repository, { signedIn = true } = {}) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({
        session: signedIn ? residentSession() : null,
      })}
    >
      <MemoryRouter>
        <HotlineDirectoryPage hotlineRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("hotline projection", () => {
  it("averages ratings from stored totals rather than trusting a stored average", () => {
    const hotline = toHotline("a", verifiedRaw);

    expect(hotline.averageRating).toBe(4);
    expect(hotline.ratingCount).toBe(4);
  });

  it("reports no average when nobody has rated", () => {
    expect(toHotline("a", { ratingCount: 0, ratingTotal: 0 }).averageRating).toBeNull();
  });

  it("refuses to call a hotline verified without a verification time", () => {
    // A record could carry verified: true with nothing behind it.
    expect(toHotline("a", { verified: true }).verified).toBe(false);
    expect(toHotline("a", { verified: false }).verified).toBe(false);
  });

  it("flags a verification that has gone stale", () => {
    const verifiedAtMillis = Date.parse("2026-01-01T00:00:00Z");
    const hotline = toHotline(
      "a",
      { ...verifiedRaw, verifiedAt: { toMillis: () => verifiedAtMillis } },
      verifiedAtMillis + VERIFICATION_STALE_AFTER_MS + 1,
    );

    expect(hotline.verificationStale).toBe(true);
  });
});

describe("review validation", () => {
  it("bounds the rating", () => {
    expect(validateReview({ rating: 0 }).errors.rating).toBeDefined();
    expect(validateReview({ rating: 6 }).errors.rating).toBeDefined();
    expect(validateReview({ rating: 3 }).isValid).toBe(true);
  });

  it("rejects a comment over the limit", () => {
    expect(
      validateReview({ rating: 3, comment: "x".repeat(MAX_COMMENT_LENGTH + 1) })
        .errors.comment,
    ).toBeDefined();
  });
});

describe("rating aggregate", () => {
  function repositoryOver({ hotline, existingReview }) {
    const hotlineWrites = [];
    const reviewWrites = [];

    const transaction = {
      get: async (reference) =>
        reference.path.includes("/reviews/")
          ? {
              exists: () => existingReview !== null,
              data: () => existingReview,
            }
          : { exists: () => true, data: () => hotline },
      set: (_ref, data) => reviewWrites.push(data),
      update: (_ref, data) => hotlineWrites.push(data),
    };

    return {
      hotlineWrites,
      reviewWrites,
      repository: createHotlineRepository({
        db: {},
        documentRef: (_db, ...segments) => ({ path: segments.join("/") }),
        transactionRunner: (_db, work) => work(transaction),
      }),
    };
  }

  it("adds one rating for a first-time reviewer", async () => {
    const { repository, hotlineWrites } = repositoryOver({
      hotline: { ratingCount: 2, ratingTotal: 8 },
      existingReview: null,
    });

    await repository.submitReview({
      hotlineId: "a",
      uid: "resident-1",
      rating: 5,
      comment: "",
    });

    expect(hotlineWrites[0].ratingCount).toBe(3);
    expect(hotlineWrites[0].ratingTotal).toBe(13);
  });

  it("replaces a previous rating instead of stacking a second one", async () => {
    const { repository, hotlineWrites } = repositoryOver({
      hotline: { ratingCount: 2, ratingTotal: 8 },
      existingReview: { rating: 3 },
    });

    await repository.submitReview({
      hotlineId: "a",
      uid: "resident-1",
      rating: 5,
      comment: "",
    });

    // Count is unchanged; only the delta moves the total.
    expect(hotlineWrites[0].ratingCount).toBe(2);
    expect(hotlineWrites[0].ratingTotal).toBe(10);
  });

  it("stores the review under the reviewer's own id", async () => {
    const { repository, reviewWrites } = repositoryOver({
      hotline: { ratingCount: 0, ratingTotal: 0 },
      existingReview: null,
    });

    await repository.submitReview({
      hotlineId: "a",
      uid: "resident-1",
      rating: 4,
      comment: "Answered quickly.",
    });

    expect(reviewWrites[0].reviewerId).toBe("resident-1");
  });
});

describe("hotline directory route", () => {
  it("shows numbers as callable links", async () => {
    renderDirectory({
      listHotlines: vi.fn().mockResolvedValue([toHotline("a", verifiedRaw)]),
      submitReview: vi.fn(),
    });

    expect(
      await screen.findByRole("link", { name: "(036) 262-4979" }),
    ).toHaveAttribute("href", "tel:(036)%20262-4979");
  });

  it("says plainly when a number has not been verified", async () => {
    renderDirectory({
      listHotlines: vi
        .fn()
        .mockResolvedValue([toHotline("a", { ...verifiedRaw, verified: false })]),
      submitReview: vi.fn(),
    });

    expect(await screen.findByText("Not yet verified")).toBeInTheDocument();
    expect(
      screen.getByText(/Nobody has verified this number yet/),
    ).toBeInTheDocument();
  });

  it("offers no rating form to a signed-out visitor but still shows the number", async () => {
    renderDirectory(
      {
        listHotlines: vi.fn().mockResolvedValue([toHotline("a", verifiedRaw)]),
        submitReview: vi.fn(),
      },
      { signedIn: false },
    );

    expect(
      await screen.findByRole("link", { name: "(036) 262-4979" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Did this number help?")).not.toBeInTheDocument();
  });

  it("submits a rating for the signed-in account", async () => {
    const submitReview = vi.fn().mockResolvedValue(undefined);

    renderDirectory({
      listHotlines: vi.fn().mockResolvedValue([toHotline("a", verifiedRaw)]),
      submitReview,
    });

    fireEvent.change(await screen.findByLabelText("Did this number help?"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save my rating" }));

    await waitFor(() => {
      expect(submitReview).toHaveBeenCalledWith({
        hotlineId: "a",
        uid: "resident-1",
        rating: 5,
        comment: "",
      });
    });
  });

  it("points elsewhere when the directory cannot load", async () => {
    renderDirectory({
      listHotlines: vi.fn().mockRejectedValue(new Error("offline")),
      submitReview: vi.fn(),
    });

    expect(
      await screen.findByText(/call your barangay hall or the national emergency line/),
    ).toBeInTheDocument();
  });
});
