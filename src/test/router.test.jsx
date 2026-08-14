import { render, screen } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createTestRouter } from "../app/router.jsx";

function renderRoute(path) {
  const router = createTestRouter([path]);
  render(<RouterProvider router={router} />);
}

describe("Phase 1 application shell", () => {
  it("renders the public landing route", async () => {
    renderRoute("/");
    expect(await screen.findByText("One shell, many migration checkpoints")).toBeInTheDocument();
  });

  it("renders the resident layout route", async () => {
    renderRoute("/app");
    expect(await screen.findByText("Resident Home")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary route navigation" })).toBeInTheDocument();
  });

  it("renders the responder layout route", async () => {
    renderRoute("/responder");
    expect(await screen.findByText("Responder Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Responder layout")).toBeInTheDocument();
  });

  it("renders the not-found route", async () => {
    renderRoute("/missing-route");
    expect(await screen.findByText("That route is outside the current migration scope.")).toBeInTheDocument();
  });
});
