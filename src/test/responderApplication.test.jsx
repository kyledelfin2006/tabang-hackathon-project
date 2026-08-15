import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ResponderApplicationPage from "../routes/responder/ResponderApplicationPage.jsx";
import {
  APPLICATION_STATUS,
  CONSENT_VERSION,
  validateApplication,
} from "../services/responders/applicationRepository.js";
import {
  buildIdentityUploadParams,
  buildSignedDeliveryUrl,
  isReviewerRole,
} from "../../scripts/uploads/cloudinarySignature.mjs";
import { createFakeAuthGateway, residentSession } from "./fakeAuthGateway.js";

function renderPage(repository) {
  return render(
    <AppProviders
      authGateway={createFakeAuthGateway({ session: residentSession() })}
    >
      <MemoryRouter>
        <ResponderApplicationPage applicationRepository={repository} />
      </MemoryRouter>
    </AppProviders>,
  );
}

const completeForm = {
  organization: "Aklan MDRRMO",
  badgeNumber: "MD-2291",
  municipality: "Kalibo",
  consentAccepted: true,
};

describe("application validation", () => {
  it("accepts a complete application with evidence", () => {
    expect(validateApplication(completeForm, { hasEvidence: true }).isValid).toBe(
      true,
    );
  });

  it("refuses to submit without explicit consent", () => {
    const { errors } = validateApplication(
      { ...completeForm, consentAccepted: false },
      { hasEvidence: true },
    );

    expect(errors.consentAccepted).toBeDefined();
  });

  it("refuses to submit without identity evidence", () => {
    const { errors } = validateApplication(completeForm, {
      hasEvidence: false,
    });

    expect(errors.evidence).toBeDefined();
  });

  it("records a versioned consent reference", () => {
    expect(CONSENT_VERSION).toMatch(/\d{4}/);
  });
});

describe("identity upload parameters", () => {
  it("uses authenticated delivery and scopes the folder to the applicant", () => {
    const params = buildIdentityUploadParams({
      uid: "resident-1",
      timestampSeconds: 1_755_000_000,
    });

    expect(params.type).toBe("authenticated");
    expect(params.access_mode).toBe("authenticated");
    expect(params.folder).toBe("tabang/responder-applications/resident-1");
  });

  it("keeps identity evidence out of the public report folder", () => {
    const params = buildIdentityUploadParams({
      uid: "resident-1",
      timestampSeconds: 1,
    });

    expect(params.folder).not.toContain("tabang/reports");
  });

  it("refuses to sign without a verified uid", () => {
    expect(() => buildIdentityUploadParams({ timestampSeconds: 1 })).toThrow(
      /verified uid/,
    );
  });

  it("signs delivery URLs so they cannot be forged", () => {
    const first = buildSignedDeliveryUrl({
      cloudName: "demo",
      publicId: "tabang/responder-applications/resident-1/id",
      apiSecret: "secret-one",
    });
    const second = buildSignedDeliveryUrl({
      cloudName: "demo",
      publicId: "tabang/responder-applications/resident-1/id",
      apiSecret: "secret-two",
    });

    expect(first).toContain("/image/authenticated/");
    expect(first).not.toBe(second);
  });

  it("treats only reviewers and admins as able to open evidence", () => {
    expect(isReviewerRole("reviewer")).toBe(true);
    expect(isReviewerRole("admin")).toBe(true);
    expect(isReviewerRole("responder")).toBe(false);
    expect(isReviewerRole("resident")).toBe(false);
  });
});

describe("responder application route", () => {
  it("states plainly that applying does not grant access", async () => {
    renderPage({
      getMyApplication: vi.fn().mockResolvedValue(null),
      submitApplication: vi.fn(),
      uploadEvidence: vi.fn(),
    });

    expect(
      await screen.findByText(
        "Submitting this does not grant responder access. A reviewer checks every application.",
      ),
    ).toBeInTheDocument();
  });

  it("never submits a status the applicant chose", async () => {
    const submitApplication = vi.fn().mockResolvedValue(undefined);

    renderPage({
      getMyApplication: vi.fn().mockResolvedValue(null),
      submitApplication,
      uploadEvidence: vi.fn().mockResolvedValue({ publicId: "x" }),
    });

    await screen.findByLabelText("Organization");
    fireEvent.change(screen.getByLabelText("Organization"), {
      target: { value: "Aklan MDRRMO" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    // Missing evidence and consent, so nothing is sent.
    await waitFor(() => {
      expect(submitApplication).not.toHaveBeenCalled();
    });
    expect(
      screen.getByText("Attach a government ID and a selfie."),
    ).toBeInTheDocument();
  });

  it("shows the pending state without granting anything", async () => {
    renderPage({
      getMyApplication: vi.fn().mockResolvedValue({
        status: APPLICATION_STATUS.pending,
        organization: "Aklan MDRRMO",
        municipality: "Kalibo",
        reviewNotes: "",
      }),
      submitApplication: vi.fn(),
      uploadEvidence: vi.fn(),
    });

    expect(await screen.findByText("Under review")).toBeInTheDocument();
    expect(
      screen.getByText(/Applying does not grant responder access\./),
    ).toBeInTheDocument();
  });

  it("shows a rejection without exposing reviewer internals", async () => {
    renderPage({
      getMyApplication: vi.fn().mockResolvedValue({
        status: APPLICATION_STATUS.rejected,
        organization: "Aklan MDRRMO",
        municipality: "Kalibo",
        reviewNotes: "",
      }),
      submitApplication: vi.fn(),
      uploadEvidence: vi.fn(),
    });

    expect(await screen.findByText("Not approved")).toBeInTheDocument();
  });
});
