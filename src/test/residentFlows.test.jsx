import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
} from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import AppProviders from "../app/providers/AppProviders.jsx";
import ReportCard from "../components/reports/ReportCard.jsx";
import ResidentLayout from "../layouts/ResidentLayout.jsx";
import AccountPage from "../routes/account/AccountPage.jsx";
import MyReportsPage from "../routes/reports/MyReportsPage.jsx";
import ReportFormPage from "../routes/reports/ReportFormPage.jsx";
import {
  classifyActionError,
  describeActionError,
} from "../services/errors/describeActionError.js";
import { createSubmissionQueue } from "../services/offline/submissionQueue.js";
import { AKLAN_MUNICIPALITIES } from "../services/places/aklanPlaces.js";
import { replayQueuedReports } from "../services/reports/replayQueuedReports.js";
import { createReportSubmitter } from "../services/reports/submitReport.js";
import { createFakeAuthGateway, residentSession } from "./fakeAuthGateway.js";

// Re-encoding needs a real canvas; the attachment flow only needs a file back.
vi.mock("../services/uploads/prepareImage.js", () => ({
  prepareImageForUpload: async (file) => ({ ok: true, file }),
}));

beforeAll(() => {
  URL.createObjectURL ??= () => "blob:preview";
  URL.revokeObjectURL ??= () => {};
});

function memoryStorage() {
  const map = new Map();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

const validForm = {
  severity: "knee",
  municipality: "Kalibo",
  barangay: "Poblacion",
  landmark: "",
  description: "The water reached the market road and is still rising.",
  contactPhone: "09171234567",
  latitude: "",
  longitude: "",
};

function networkError() {
  const error = new Error("Data request failed: ");

  error.code = "";
  error.cause = { name: "TypeError", message: "Failed to fetch" };

  return error;
}

function renderWithSession(ui, { session = residentSession(), actions } = {}) {
  return render(
    <AppProviders authGateway={createFakeAuthGateway({ session, actions })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

describe("report submitter", () => {
  function setup({ upload, submit } = {}) {
    const queue = createSubmissionQueue({ storage: memoryStorage() });
    const repository = { submitReport: vi.fn(submit ?? (async () => ({}))) };
    const uploader = {
      upload: vi.fn(upload ?? (async () => ({ path: "r/p/1.jpg" }))),
    };

    return {
      queue,
      repository,
      uploader,
      submitter: createReportSubmitter({ repository, uploader, queue }),
    };
  }

  const submission = {
    reportId: "report-1",
    reporterId: "resident-1",
    kind: "flood",
    form: validForm,
    attachments: [{ file: new File(["x"], "a.jpg", { type: "image/jpeg" }) }],
  };

  it("returns field errors without queueing or sending an invalid report", async () => {
    const { queue, repository, submitter } = setup();

    const result = await submitter.submit({
      ...submission,
      form: { ...validForm, municipality: "" },
    });

    expect(result.status).toBe("invalid");
    expect(result.errors.municipality).toBeDefined();
    expect(queue.list()).toEqual([]);
    expect(repository.submitReport).not.toHaveBeenCalled();
  });

  it("queues before sending and clears the queue once accepted", async () => {
    let queuedDuringSend;
    const { queue, submitter } = setup({
      submit: async () => {
        queuedDuringSend = queue.list().length;
      },
    });

    expect(await submitter.submit(submission)).toEqual({ status: "submitted" });
    expect(queuedDuringSend).toBe(1);
    expect(queue.list()).toEqual([]);
  });

  it("reports a photo failure separately and can then send without photos", async () => {
    const { queue, repository, submitter } = setup({
      upload: async () => {
        throw new Error("Payload too large");
      },
    });

    const failed = await submitter.submit(submission);

    expect(failed).toMatchObject({ status: "failed", reason: "upload" });
    expect(failed.message).not.toMatch(/Payload too large/);
    expect(repository.submitReport).not.toHaveBeenCalled();
    expect(queue.list()[0]).toMatchObject({
      attempts: 1,
      lastFailure: "upload",
    });

    expect(await submitter.submit({ ...submission, skipPhotos: true })).toEqual(
      {
        status: "submitted",
      },
    );
    expect(repository.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "report-1", images: [] }),
    );
  });

  it("keeps the report queued when the network fails", async () => {
    const { queue, submitter } = setup({
      submit: async () => {
        throw networkError();
      },
    });

    expect(await submitter.submit(submission)).toMatchObject({
      status: "failed",
      reason: "network",
    });
    expect(queue.list()).toHaveLength(1);
  });
});

describe("queued report replay", () => {
  function queueWith(...reportIds) {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    reportIds.forEach((reportId, index) =>
      queue.enqueue({
        reportId,
        kind: "flood",
        values: { n: index },
        queuedAtMillis: index,
      }),
    );

    return queue;
  }

  it("sends oldest first by id, so a repeat never makes a second report", async () => {
    const queue = queueWith("a", "b");
    const filed = new Set();
    const repository = {
      submitReport: vi.fn(async ({ reportId }) => filed.add(reportId)),
    };

    expect(
      await replayQueuedReports({ queue, repository, reporterId: "r" }),
    ).toEqual({
      sent: ["a", "b"],
      remaining: [],
    });

    // A second replay has nothing left to resend.
    await replayQueuedReports({ queue, repository, reporterId: "r" });
    expect(repository.submitReport).toHaveBeenCalledTimes(2);
    expect([...filed]).toEqual(["a", "b"]);
  });

  it("stops at the first network failure and keeps everything queued", async () => {
    const queue = queueWith("a", "b");
    const repository = {
      submitReport: vi.fn(async () => {
        throw networkError();
      }),
    };

    const result = await replayQueuedReports({
      queue,
      repository,
      reporterId: "r",
    });

    expect(repository.submitReport).toHaveBeenCalledTimes(1);
    expect(result.remaining.map((entry) => entry.reportId)).toEqual(["a", "b"]);
  });

  it("does nothing without a signed-in reporter", async () => {
    const queue = queueWith("a");
    const repository = { submitReport: vi.fn() };

    await replayQueuedReports({ queue, repository, reporterId: undefined });
    expect(repository.submitReport).not.toHaveBeenCalled();
  });

  it("discards an entry on request", () => {
    const queue = queueWith("a", "b");

    queue.discard("a");
    expect(queue.list().map((entry) => entry.reportId)).toEqual(["b"]);
  });
});

describe("action error copy", () => {
  it("maps known codes to plain language and never echoes the provider", () => {
    const providerError = new Error("Data request failed");

    providerError.code = "42501";
    providerError.cause = { message: 'permission denied for table "reports"' };

    expect(describeActionError(providerError)).toMatch(/permission/i);
    expect(describeActionError(providerError)).not.toMatch(/table/);
    expect(describeActionError({ code: "not_cancellable" })).toMatch(
      /no longer be cancelled/,
    );
    expect(
      describeActionError({ code: "whatever", message: "SELECT * FROM x" }),
    ).toBe("That did not work. Try again in a moment.");
    expect(classifyActionError(networkError())).toBe("network");
  });
});

describe("report form", () => {
  // The fake session arrives on a microtask, as the real one does
  // asynchronously; the route guard waits for it in the app.
  async function renderForm(props) {
    const rendered = renderWithSession(
      <ReportFormPage
        submissionQueue={createSubmissionQueue({ storage: memoryStorage() })}
        {...props}
      />,
    );

    await act(async () => {});

    return rendered;
  }

  function fillValidReport() {
    fireEvent.change(screen.getByLabelText("How deep is the water?"), {
      target: { value: "knee" },
    });
    fireEvent.change(screen.getByLabelText("Municipality"), {
      target: { value: "Kalibo" },
    });
    fireEvent.change(screen.getByLabelText("Barangay"), {
      target: { value: "Poblacion" },
    });
    fireEvent.change(screen.getByLabelText("What is happening?"), {
      target: { value: validForm.description },
    });
    fireEvent.change(screen.getByLabelText("Contact number"), {
      target: { value: "09171234567" },
    });
  }

  it("REQ-014: offers the Aklan municipalities and no typed coordinates", async () => {
    await renderForm();

    const options = [...screen.getByLabelText("Municipality").options].map(
      (option) => option.value,
    );

    expect(options.slice(1)).toEqual([...AKLAN_MUNICIPALITIES]);
    expect(screen.queryByLabelText("Latitude")).toBeNull();
    expect(screen.queryByLabelText("Longitude")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Use my current location" }),
    ).toBeInTheDocument();
  });

  it("REQ-030: focuses an error summary that links to each invalid field", async () => {
    const reportRepository = { submitReport: vi.fn() };

    await renderForm({ reportRepository });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    const summary = await screen.findByRole("alert");

    await waitFor(() => expect(summary).toHaveFocus());

    const link = screen.getByRole("link", {
      name: "Choose your municipality.",
    });
    const field = screen.getByLabelText("Municipality");

    expect(link).toHaveAttribute("href", `#${field.id}`);
    expect(field).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(`${field.id}-error`),
    );
    expect(document.getElementById(`${field.id}-error`)).toHaveTextContent(
      "Choose your municipality.",
    );
    expect(reportRepository.submitReport).not.toHaveBeenCalled();
  });

  it("REQ-015: offers to send without photos when the upload fails", async () => {
    const reportRepository = { submitReport: vi.fn(async () => ({})) };
    const uploader = {
      upload: vi.fn(async () => {
        throw new Error("upload failed");
      }),
    };
    const { container } = await renderForm({ reportRepository, uploader });

    fillValidReport();
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Send without photos" }),
    );

    await waitFor(() =>
      expect(reportRepository.submitReport).toHaveBeenCalledWith(
        expect.objectContaining({ images: [] }),
      ),
    );
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it("REQ-017: shows 911 and directory numbers when sending fails", async () => {
    const reportRepository = {
      submitReport: vi.fn(async () => {
        throw networkError();
      }),
    };
    const hotlineRepository = {
      listHotlines: vi.fn(async () => [
        {
          id: "aklan-pdrrmo",
          organization: "Aklan Provincial DRRM Office",
          phoneNumbers: ["(036) 262-4979"],
          verified: false,
        },
      ]),
    };

    await renderForm({ reportRepository, hotlineRepository });
    fillValidReport();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByRole("link", { name: "(036) 262-4979" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "911" })).toHaveAttribute(
      "href",
      "tel:911",
    );
    expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
  });

  it("REQ-017: still shows 911 when the directory cannot load", async () => {
    await renderForm({
      reportRepository: {
        submitReport: vi.fn(async () => Promise.reject(networkError())),
      },
      hotlineRepository: {
        listHotlines: vi.fn(async () => Promise.reject(networkError())),
      },
    });
    fillValidReport();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByRole("link", { name: "911" }),
    ).toBeInTheDocument();
  });
});

describe("pending reports", () => {
  function queueWithOne() {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    queue.enqueue({
      reportId: "report-9",
      kind: "flood",
      values: { publicLocationLabel: "Poblacion, Kalibo" },
    });

    return queue;
  }

  const emptyPage = { reports: [], cursor: null, hasMore: false };

  it("REQ-016: sends a saved report on request and removes it", async () => {
    const queue = queueWithOne();
    const reportRepository = {
      listMyReports: vi.fn(async () => emptyPage),
      submitReport: vi.fn(async () => ({})),
      cancelReport: vi.fn(),
    };

    renderWithSession(
      <MyReportsPage
        reportRepository={reportRepository}
        submissionQueue={queue}
      />,
    );

    expect(
      await screen.findByText("Flood report, Poblacion, Kalibo"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));

    await waitFor(() =>
      expect(screen.queryByText("Flood report, Poblacion, Kalibo")).toBeNull(),
    );
    expect(reportRepository.submitReport).toHaveBeenCalledWith({
      reportId: "report-9",
      values: { publicLocationLabel: "Poblacion, Kalibo" },
      images: [],
    });
    expect(queue.list()).toEqual([]);
  });

  it("REQ-016: discards a saved report without sending it", async () => {
    const queue = queueWithOne();
    const reportRepository = {
      listMyReports: vi.fn(async () => emptyPage),
      submitReport: vi.fn(),
      cancelReport: vi.fn(),
    };

    renderWithSession(
      <MyReportsPage
        reportRepository={reportRepository}
        submissionQueue={queue}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));

    await waitFor(() => expect(queue.list()).toEqual([]));
    expect(reportRepository.submitReport).not.toHaveBeenCalled();
  });

  it("REQ-016: resends automatically when the connection returns", async () => {
    const queue = queueWithOne();
    const reportRepository = {
      submitReport: vi
        .fn()
        .mockRejectedValueOnce(networkError())
        .mockResolvedValue({}),
    };

    const router = createMemoryRouter(
      [
        {
          path: "/app",
          element: (
            <ResidentLayout
              reportRepository={reportRepository}
              submissionQueue={queue}
            />
          ),
          children: [
            {
              index: true,
              element: <p>Home</p>,
              handle: { title: "Resident home" },
            },
          ],
        },
      ],
      { initialEntries: ["/app"] },
    );

    render(
      <AppProviders
        authGateway={createFakeAuthGateway({ session: residentSession() })}
      >
        <RouterProvider router={router} />
      </AppProviders>,
    );

    // The first attempt on open fails offline; the entry stays queued.
    await waitFor(() =>
      expect(reportRepository.submitReport).toHaveBeenCalledTimes(1),
    );
    expect(queue.list()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(queue.list()).toEqual([]));
    expect(reportRepository.submitReport).toHaveBeenCalledTimes(2);
  });
});

describe("REQ-019: cancel visibility", () => {
  const base = {
    id: "report-1",
    kind: "flood",
    publicLocationLabel: "Poblacion, Kalibo",
    description: "Water rising near the bridge.",
    verificationStatus: "pending",
    createdAtMillis: 0,
  };

  it.each([
    ["new", true],
    ["acknowledged", true],
    ["dispatched", false],
    ["resolved", false],
    ["cancelled", false],
  ])("a %s report shows cancel: %s", (incidentStatus, expected) => {
    render(
      <ul>
        <ReportCard
          onCancel={() => {}}
          report={{
            ...base,
            incidentStatus,
            canCancel:
              incidentStatus === "new" || incidentStatus === "acknowledged",
          }}
        />
      </ul>,
    );

    expect(
      Boolean(screen.queryByRole("button", { name: "Cancel this report" })),
    ).toBe(expected);
  });

  it("shows plain copy when cancelling is refused", async () => {
    const reportRepository = {
      listMyReports: vi.fn(async () => ({
        reports: [{ ...base, incidentStatus: "new", canCancel: true }],
        cursor: null,
        hasMore: false,
      })),
      cancelReport: vi.fn(async () => {
        const error = new Error("Data request failed: not_cancellable");

        error.code = "not_cancellable";
        throw error;
      }),
    };

    renderWithSession(
      <MyReportsPage
        reportRepository={reportRepository}
        submissionQueue={createSubmissionQueue({ storage: memoryStorage() })}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel this report" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel the report" }));

    expect(
      await screen.findByText(/no longer be cancelled/),
    ).toBeInTheDocument();
  });
});

describe("REQ-021: account details", () => {
  it("saves name, phone, and barangay for the signed-in account", async () => {
    const updateOwnProfile = vi.fn(async () => {});

    renderWithSession(<AccountPage />, { actions: { updateOwnProfile } });

    fireEvent.change(await screen.findByLabelText("Barangay"), {
      target: { value: "  Estancia " },
    });
    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "+63 999 888 7777" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(
      await screen.findByText("Your details have been saved."),
    ).toBeInTheDocument();
    expect(updateOwnProfile).toHaveBeenCalledWith("resident-1", {
      displayName: "Resident One",
      phone: "09998887777",
      barangay: "Estancia",
    });
  });

  it("refuses an invalid phone number without saving", async () => {
    const updateOwnProfile = vi.fn();

    renderWithSession(<AccountPage />, { actions: { updateOwnProfile } });
    fireEvent.change(await screen.findByLabelText("Mobile number"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(
      await screen.findByText(/Philippine mobile number/),
    ).toBeInTheDocument();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });
});
