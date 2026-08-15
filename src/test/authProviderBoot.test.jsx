import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppErrorBoundary from "../app/ErrorBoundary.jsx";
import AuthProvider from "../app/providers/AuthProvider.jsx";
import { useAuth } from "../app/providers/useAuth.js";

/*
 * Every other suite injects a gateway, which is exactly why the production
 * crash got through: with a gateway the provider's setup object is always
 * truthy, so the first-render path where it is still null was never rendered
 * by any test. The deployed site hit it immediately and showed the error
 * boundary instead of the app.
 */

function SessionProbe() {
  const { status } = useAuth();

  return <p>Session status: {status}</p>;
}

describe("provider boot without an injected gateway", () => {
  it("renders while the firebase import is still pending", () => {
    render(
      <AppErrorBoundary>
        <AuthProvider>
          <SessionProbe />
        </AuthProvider>
      </AppErrorBoundary>,
    );

    // The real assertion is that this render did not throw. Reaching the
    // probe at all means the boundary never took over.
    expect(screen.getByText(/Session status: loading/)).toBeInTheDocument();
    expect(screen.queryByText("This page did not load")).toBeNull();
  });
});
