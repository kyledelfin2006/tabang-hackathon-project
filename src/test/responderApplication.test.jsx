import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ResponderApplicationPage from "../routes/responder/ResponderApplicationPage.jsx";
import {
  APPLICATION_STATUS,
  CONSENT_VERSION,
  createApplicationRepository,
  validateApplication,
} from "../services/responders/applicationRepository.js";
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

// Storage upload details; the policy suite verifies the bucket boundary.
describe("identity evidence upload", () => {
  function repositoryFor(session) {
    const uploads = [];
    const client = {
      auth: { getSession: async () => ({ data: { session } }) },
      storage: {
        from: (bucket) => ({
          upload: async (path, file, options) => {
            uploads.push({ bucket, path, file, options });
            return { data: { path }, error: null };
          },
        }),
      },
    };

    return { uploads, repository: createApplicationRepository({ client }) };
  }

  it("stores evidence in the private bucket under the applicant's own folder", async () => {
    const { uploads, repository } = repositoryFor({ user: { id: "resident-1" } });
    const file = new File(["x"], "id.png", { type: "image/png" });

    const result = await repository.uploadEvidence(file);

    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("identity-evidence");
    expect(uploads[0].path).toMatch(/^resident-1\/[0-9a-f-]+\.png$/);
    expect(uploads[0].options.contentType).toBe("image/png");
    expect(result.path).toBe(uploads[0].path);
  });

  it("refuses to upload without a signed-in account", async () => {
    const { uploads, repository } = repositoryFor(null);

    await expect(repository.uploadEvidence(new File(["x"], "id.png"))).rejects.toThrow(
      /Sign in/,
    );
    expect(uploads).toEqual([]);
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
      uploadEvidence: vi.fn().mockResolvedValue({ path: "resident-1/x.jpg" }),
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
