import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { appRoutes } from "../app/router.jsx";
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
  verifiedAtMillis: Date.parse("2026-08-01T00:00:00Z"),
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
    expect(
      toHotline("a", { ratingCount: 0, ratingTotal: 0 }).averageRating,
    ).toBeNull();
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
      { ...verifiedRaw, verifiedAtMillis },
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

// Totals are computed by the hotline_directory view from stored reviews;
// tests/policies/hotlines.test.mjs proves they cannot be forged.
describe("rating submission", () => {
  it("writes only the review, never a count or a total", async () => {
    const writes = [];
    const repository = createHotlineRepository({
      client: {
        from: (table) => ({
          upsert: async (row) => (writes.push([table, row]), { error: null }),
        }),
      },
    });

    await repository.submitReview({ hotlineId: "a", rating: 4, comment: "Answered quickly." });

    expect(writes).toEqual([
      ["hotline_reviews", { hotline_id: "a", rating: 4, comment: "Answered quickly." }],
    ]);
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
        .mockResolvedValue([
          toHotline("a", { ...verifiedRaw, verified: false }),
        ]),
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
    expect(
      screen.queryByLabelText("Did this number help?"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call 911 now" })).toHaveAttribute(
      "href",
      "tel:911",
    );
  });

  it("submits a rating for the signed-in account", async () => {
    const submitReview = vi.fn().mockResolvedValue(undefined);

    renderDirectory({
      listHotlines: vi.fn().mockResolvedValue([toHotline("a", verifiedRaw)]),
      submitReview,
    });

    fireEvent.click(await screen.findByText("Rate this number"));
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
      await screen.findByText(
        /you can still call 911 or contact your barangay hall/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call 911 now" })).toHaveAttribute(
      "href",
      "tel:911",
    );
  });

  it("keeps the 911 card when the directory is empty", async () => {
    renderDirectory(
      {
        listHotlines: vi.fn().mockResolvedValue([]),
        submitReview: vi.fn(),
      },
      { signedIn: false },
    );

    expect(
      await screen.findByText("No hotlines listed yet"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call 911 now" })).toHaveAttribute(
      "href",
      "tel:911",
    );
  });

  it("serves /hotlines publicly with one focused page heading", async () => {
    const publicRoot = appRoutes.find((route) => route.path === "/");
    const routes = appRoutes.map((route) =>
      route === publicRoot
        ? {
            ...route,
            children: route.children.map((child) =>
              child.path === "hotlines"
                ? {
                    ...child,
                    element: (
                      <HotlineDirectoryPage
                        hotlineRepository={{
                          listHotlines: vi.fn().mockResolvedValue([]),
                          submitReview: vi.fn(),
                        }}
                      />
                    ),
                  }
                : child,
            ),
          }
        : route,
    );
    const router = createMemoryRouter(routes, {
      initialEntries: ["/hotlines"],
    });

    render(
      <AppProviders authGateway={createFakeAuthGateway()}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Emergency hotlines",
    });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(heading).toHaveFocus();
    expect(screen.getByRole("link", { name: "Call 911 now" })).toHaveAttribute(
      "href",
      "tel:911",
    );
    await waitFor(() =>
      expect(document.title).toBe("Emergency hotlines | Tabang"),
    );
  });
});
