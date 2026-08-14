import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import { createTestRouter } from "../app/router.jsx";
import { createFakeAuthGateway } from "./fakeAuthGateway.js";
import { GENERIC_CREDENTIAL_MESSAGE } from "../services/auth/authErrors.js";

function renderRoute(path, actions = {}) {
  const gateway = createFakeAuthGateway({ session: null, actions });
  const router = createTestRouter([path]);

  render(
    <AppProviders authGateway={gateway}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { gateway, router };
}

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(buttonName) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
}

describe("authentication forms", () => {
  it("shows inline validation errors without calling the gateway", async () => {
    const signIn = vi.fn();
    renderRoute("/login", { signIn });

    await screen.findByLabelText("Email address");
    fill("Email address", "not-an-email");
    submit("Sign in");

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("associates an inline error with its input for assistive technology", async () => {
    renderRoute("/login");

    await screen.findByLabelText("Email address");
    fill("Email address", "not-an-email");
    submit("Sign in");

    const input = await screen.findByLabelText("Email address");

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy)).toHaveTextContent(
      "Enter a valid email address.",
    );
  });

  it("reports one generic message for any failed credential", async () => {
    const signIn = vi.fn().mockRejectedValue({ code: "auth/user-not-found" });
    renderRoute("/login", { signIn });

    await screen.findByLabelText("Email address");
    fill("Email address", "resident@example.test");
    fill("Password", "correct horse battery");
    submit("Sign in");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      GENERIC_CREDENTIAL_MESSAGE,
    );
  });

  it("toggles password visibility", async () => {
    renderRoute("/login");

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    submit("Show");
    expect(password).toHaveAttribute("type", "text");
  });

  it("normalizes the profile and registers only a resident", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    renderRoute("/signup", { register });

    await screen.findByLabelText("Full name");
    fill("Full name", "  Ana  Cruz ");
    fill("Email address", "Ana@Example.TEST");
    fill("Mobile number", "+63 917 123 4567");
    fill("Barangay", "Poblacion");
    fill("Password", "flood-ready-2026");
    fill("Confirm password", "flood-ready-2026");
    submit("Create account");

    await waitFor(() => {
      expect(register).toHaveBeenCalledTimes(1);
    });

    const submitted = register.mock.calls[0][0];
    expect(submitted).toEqual({
      displayName: "Ana Cruz",
      email: "ana@example.test",
      phone: "09171234567",
      barangay: "Poblacion",
      password: "flood-ready-2026",
    });
    // The form must never be able to request an elevated role.
    expect(Object.keys(submitted)).not.toContain("role");
  });

  it("rejects a mismatched password confirmation", async () => {
    const register = vi.fn();
    renderRoute("/signup", { register });

    await screen.findByLabelText("Full name");
    fill("Full name", "Ana Cruz");
    fill("Email address", "ana@example.test");
    fill("Mobile number", "09171234567");
    fill("Barangay", "Poblacion");
    fill("Password", "flood-ready-2026");
    fill("Confirm password", "flood-ready-2025");
    submit("Create account");

    expect(
      await screen.findByText("Passwords do not match."),
    ).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("acknowledges a password reset identically whether or not it succeeded", async () => {
    const sendPasswordReset = vi
      .fn()
      .mockRejectedValue({ code: "auth/user-not-found" });
    renderRoute("/reset-password", { sendPasswordReset });

    await screen.findByLabelText("Email address");
    fill("Email address", "unknown@example.test");
    submit("Send reset link");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If that email address has an account",
    );
  });
});
