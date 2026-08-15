import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmergencyFallback from "../components/feedback/EmergencyFallback.jsx";
import {
  SUBMISSION_STATE,
  SUBMISSION_STATE_COPY,
  createSubmissionQueue,
} from "../services/offline/submissionQueue.js";

function memoryStorage() {
  const map = new Map();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

/**
 * Matches an affirmative claim of delivery.
 *
 * Banning the words outright was wrong: "Not sent yet" is exactly the honest
 * phrasing we want, and it contains "sent". What must never appear is the
 * claim itself, so a preceding negation excludes the match.
 */
const CLAIMS_DELIVERY = /(?<!\bnot\s)(?<!\bnever\s)(?<!\bnot yet\s)\b(sent|delivered|received)\b/i;

describe("submission wording", () => {
  it("never claims a locally saved report was delivered", () => {
    const saved = SUBMISSION_STATE_COPY[SUBMISSION_STATE.savedLocally];
    const failed = SUBMISSION_STATE_COPY[SUBMISSION_STATE.failed];

    for (const copy of [saved, failed]) {
      expect(copy).not.toMatch(CLAIMS_DELIVERY);
      // And it must say plainly that nobody has seen it.
      expect(copy).toMatch(/nobody has seen it/i);
    }
  });

  it("recognises an affirmative claim when one is present", () => {
    // Guards the guard: a regex that matched nothing would pass the test above
    // no matter how the copy changed.
    expect("Sent. Responders can see this report.").toMatch(CLAIMS_DELIVERY);
    expect("Your report was delivered.").toMatch(CLAIMS_DELIVERY);
    expect("Not sent yet.").not.toMatch(CLAIMS_DELIVERY);
  });

  it("uses sent only once the server accepted the report", () => {
    expect(SUBMISSION_STATE_COPY[SUBMISSION_STATE.submitted]).toMatch(/^Sent\./);
  });
});

describe("submission queue", () => {
  it("keeps one entry per report id however many times it is queued", () => {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    queue.enqueue({ reportId: "report-1", values: { description: "first" } });
    queue.enqueue({ reportId: "report-1", values: { description: "second" } });

    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0].values.description).toBe("second");
  });

  it("keeps separate reports separate", () => {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    queue.enqueue({ reportId: "report-1" });
    queue.enqueue({ reportId: "report-2" });

    expect(queue.list()).toHaveLength(2);
  });

  it("removes an entry once it has actually been sent", () => {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    queue.enqueue({ reportId: "report-1" });
    queue.remove("report-1");

    expect(queue.list()).toEqual([]);
  });

  it("clears everything on sign-out", () => {
    const queue = createSubmissionQueue({ storage: memoryStorage() });

    queue.enqueue({ reportId: "report-1", values: { contactPhone: "09171234567" } });
    queue.clear();

    expect(queue.list()).toEqual([]);
  });

  it("survives unreadable storage rather than blocking a submission", () => {
    const broken = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const queue = createSubmissionQueue({ storage: broken });

    expect(queue.list()).toEqual([]);
    expect(() => queue.enqueue({ reportId: "report-1" })).not.toThrow();
  });

  it("behaves as an empty queue when storage is unavailable", () => {
    const queue = createSubmissionQueue({ storage: null });

    expect(queue.list()).toEqual([]);
    expect(() => queue.clear()).not.toThrow();
  });
});

describe("emergency fallback", () => {
  it("offers numbers to call and does not claim the report was sent", () => {
    render(
      <EmergencyFallback
        hotlines={[
          {
            id: "a",
            organization: "Aklan PDRRMO",
            phoneNumbers: ["(036) 262-4979"],
            verified: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("Your report has not been sent")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "(036) 262-4979" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not yet verified/)).toBeInTheDocument();
  });

  it("still points somewhere when no hotlines could be loaded", () => {
    render(<EmergencyFallback hotlines={[]} />);

    expect(
      screen.getByText(/Contact your barangay hall or the municipal DRRM office/),
    ).toBeInTheDocument();
  });
});
