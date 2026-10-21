import { describe, expect, it } from "vitest";
import {
  ACKNOWLEDGEMENT_TARGET_MS,
  INCIDENT_STATUS,
  allowedNextStatuses,
  buildTransitionEvent,
  canTransition,
  describeTransitionRejection,
  isOverdue,
  toIncident,
} from "../services/incidents/incidentLifecycle.js";
import {
  INCIDENT_PAGE_SIZE,
  buildIncidentQuerySpec,
  createIncidentRepository,
  rowToIncident,
} from "../services/incidents/incidentRepository.js";

describe("incident transitions", () => {
  it("allows only the documented forward steps", () => {
    expect(allowedNextStatuses(INCIDENT_STATUS.new)).toEqual(["acknowledged"]);
    expect(allowedNextStatuses(INCIDENT_STATUS.acknowledged)).toEqual([
      "dispatched",
      "resolved",
    ]);
    expect(allowedNextStatuses(INCIDENT_STATUS.dispatched)).toEqual([
      "on_scene",
      "resolved",
    ]);
    expect(allowedNextStatuses(INCIDENT_STATUS.onScene)).toEqual(["resolved"]);
  });

  it("treats resolved and cancelled as terminal", () => {
    expect(allowedNextStatuses(INCIDENT_STATUS.resolved)).toEqual([]);
    expect(allowedNextStatuses(INCIDENT_STATUS.cancelled)).toEqual([]);
    expect(
      describeTransitionRejection(INCIDENT_STATUS.resolved, INCIDENT_STATUS.dispatched),
    ).toMatch(/closed and cannot be reopened/);
  });

  it("rejects skipping acknowledgement", () => {
    expect(canTransition(INCIDENT_STATUS.new, INCIDENT_STATUS.resolved)).toBe(
      false,
    );
    expect(
      describeTransitionRejection(INCIDENT_STATUS.new, INCIDENT_STATUS.onScene),
    ).toMatch(/cannot go from new to on_scene/);
  });

  it("rejects a status that does not exist", () => {
    expect(describeTransitionRejection(INCIDENT_STATUS.new, "escalated")).toMatch(
      /not an incident status/,
    );
  });

  it("reports no rejection for a valid step", () => {
    expect(
      describeTransitionRejection(
        INCIDENT_STATUS.acknowledged,
        INCIDENT_STATUS.dispatched,
      ),
    ).toBeNull();
  });
});

describe("overdue flagging", () => {
  const createdAtMillis = Date.parse("2026-08-14T02:00:00Z");

  it("flags an unacknowledged incident past the target", () => {
    expect(
      isOverdue(
        { incidentStatus: INCIDENT_STATUS.new, createdAtMillis },
        createdAtMillis + ACKNOWLEDGEMENT_TARGET_MS + 1,
      ),
    ).toBe(true);
  });

  it("does not flag one still inside the window", () => {
    expect(
      isOverdue(
        { incidentStatus: INCIDENT_STATUS.new, createdAtMillis },
        createdAtMillis + 60_000,
      ),
    ).toBe(false);
  });

  it("does not flag an incident somebody has already acknowledged", () => {
    expect(
      isOverdue(
        { incidentStatus: INCIDENT_STATUS.acknowledged, createdAtMillis },
        createdAtMillis + ACKNOWLEDGEMENT_TARGET_MS + 1,
      ),
    ).toBe(false);
  });
});

describe("incident projection", () => {
  it("gives responders the operational fields they need", () => {
    const incident = toIncident("report-1", {
      kind: "flood",
      incidentStatus: "new",
      description: "Water is knee deep.",
      contactPhone: "09171234567",
      preciseLocation: { latitude: 11.7061, longitude: 122.3648 },
      createdAtMillis: 1_755_000_000_000,
    });

    expect(incident.contactPhone).toBe("09171234567");
    expect(incident.preciseLocation).toEqual({
      latitude: 11.7061,
      longitude: 122.3648,
    });
  });

  it("does not carry identity evidence or unrelated profile fields", () => {
    const incident = toIncident("report-1", {
      kind: "flood",
      incidentStatus: "new",
      identityDocumentPath: "tabang/responder-applications/resident-1/id",
      selfiePath: "tabang/responder-applications/resident-1/selfie",
      reporterEmail: "resident@example.test",
      reporterId: "resident-1",
    });

    expect(incident.identityDocumentPath).toBeUndefined();
    expect(incident.selfiePath).toBeUndefined();
    expect(incident.reporterEmail).toBeUndefined();
  });
});

describe("incident queue spec", () => {
  it("defaults to open incidents and caps the page", () => {
    const spec = buildIncidentQuerySpec();

    expect(spec.statuses).toEqual([
      "new",
      "acknowledged",
      "dispatched",
      "on_scene",
    ]);
    expect(spec.statuses).not.toContain("cancelled");
    expect(spec.limit).toBe(INCIDENT_PAGE_SIZE);
  });

  it("orders oldest first so the longest wait is handled first", () => {
    expect(buildIncidentQuerySpec().orderBy).toEqual([
      ["created_at", "asc"],
      ["id", "asc"],
    ]);
  });

  it("caps a caller asking for more than a page", () => {
    expect(buildIncidentQuerySpec({ pageSize: 5000 }).limit).toBe(
      INCIDENT_PAGE_SIZE,
    );
  });
});

describe("incident rows", () => {
  it("maps a database row to plain values", () => {
    const incident = rowToIncident(
      {
        id: "report-1",
        kind: "help",
        incident_status: "acknowledged",
        verification_status: "pending",
        priority: "medium",
        public_location_label: "Poblacion, Kalibo",
        description: "Two families on a roof.",
        contact_phone: "09171234567",
        latitude: null,
        longitude: null,
        severity: null,
        need: "rescue",
        people_affected: 6,
        assigned_responder_ids: ["responder-1"],
        created_at: "2026-10-17T08:00:00+08:00",
        acknowledged_at: "2026-10-17T08:05:00+08:00",
      },
      Date.parse("2026-10-17T09:00:00+08:00"),
    );

    expect(incident.preciseLocation).toBeNull();
    expect(incident.createdAtMillis).toBe(Date.parse("2026-10-17T08:00:00+08:00"));
    expect(incident.isClaimed).toBe(true);
    expect(incident.waitingFor).toBe("1 hr 0 min");
  });
});

// The app API decides; these check only that its answers reach
// the screens as the error types the screens already recognise.
function clientAnswering(code) {
  return {
    post: async () => {
      if (code) {
        const err = new Error(code);
        err.code = code;
        throw err;
      }
      return { ok: true };
    },
  };
}

describe("incident actions", () => {
  it("passes the database function's code through", async () => {
    for (const code of ["already_claimed", "invalid_transition", "not_found"]) {
      const repository = createIncidentRepository({ client: clientAnswering(code) });

      await expect(
        repository.transitionIncident({ incidentId: "report-1", toStatus: "resolved" }),
      ).rejects.toMatchObject({ code });
    }
  });

  it("verifies through the database function", async () => {
    const calls = [];
    const repository = createIncidentRepository({
      client: { post: async (path, body) => (calls.push([path, body]), { ok: true }) },
    });

    await repository.verifyIncident({ incidentId: "report-1", verificationStatus: "verified" });

    expect(calls).toEqual([
      ["/api/app/incidents/report-1/verify", { verificationStatus: "verified" }],
    ]);
  });

  it("maps exact counts from the database", async () => {
    const repository = createIncidentRepository({
      client: {
        get: async () => ({
          openIncidents: 30,
          unclaimed: 4,
          overdue: 2,
          verified: 11,
          awaitingVerification: 19,
          countedAtMillis: Date.parse("2026-10-18T00:00:00+00:00"),
        }),
      },
    });

    expect(await repository.countIncidents()).toEqual({
      openIncidents: 30,
      unclaimed: 4,
      overdue: 2,
      verified: 11,
      awaitingVerification: 19,
      countedAtMillis: Date.parse("2026-10-18T00:00:00+00:00"),
    });
  });

  it("returns photo links in order and null for one that is empty", async () => {
    const repository = createIncidentRepository();

    expect(await repository.getPhotoUrls(["r/p/a.jpg", null, "r/p/b.jpg"])).toEqual([
      "/api/app/files/report-photos/r/p/a.jpg",
      null,
      "/api/app/files/report-photos/r/p/b.jpg",
    ]);
    expect(await repository.getPhotoUrls([])).toEqual([]);
  });

  it("passes the incident, status, and note to the transition endpoint", async () => {
    const calls = [];
    const repository = createIncidentRepository({
      client: { post: async (path, body) => (calls.push([path, body]), { ok: true }) },
    });

    await repository.transitionIncident({ incidentId: "report-1", toStatus: "dispatched", note: "Boat sent." });

    expect(calls).toEqual([
      ["/api/app/incidents/report-1/transition", { toStatus: "dispatched", note: "Boat sent." }],
    ]);
  });
});

describe("audit events", () => {
  it("trims an overlong note rather than storing it whole", () => {
    const event = buildTransitionEvent({
      fromStatus: "new",
      toStatus: "acknowledged",
      actorId: "responder-5",
      actorRole: "responder",
      note: "x".repeat(900),
    });

    expect(event.note).toHaveLength(500);
  });

  it("carries the actor identity and role", () => {
    const event = buildTransitionEvent({
      fromStatus: "new",
      toStatus: "acknowledged",
      actorId: "responder-5",
      actorRole: "responder",
    });

    expect(event.actorId).toBe("responder-5");
    expect(event.actorRole).toBe("responder");
    expect(event.type).toBe("status-change");
  });
});
