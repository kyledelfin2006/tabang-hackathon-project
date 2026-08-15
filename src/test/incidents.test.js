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
  AlreadyClaimedError,
  INCIDENT_PAGE_SIZE,
  TransitionError,
  buildIncidentQuerySpec,
  createIncidentRepository,
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
      createdAt: { toMillis: () => 1_755_000_000_000 },
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
      ["createdAt", "asc"],
      ["__name__", "asc"],
    ]);
  });

  it("caps a caller asking for more than a page", () => {
    expect(buildIncidentQuerySpec({ pageSize: 5000 }).limit).toBe(
      INCIDENT_PAGE_SIZE,
    );
  });
});

describe("claiming an incident", () => {
  function repositoryOver(stored) {
    const writes = [];
    const events = [];

    const transaction = {
      get: async () => ({
        exists: () => stored !== null,
        data: () => stored,
      }),
      update: (_ref, data) => writes.push(data),
      set: (_ref, data) => events.push(data),
    };

    return {
      writes,
      events,
      repository: createIncidentRepository({
        db: {},
        documentRef: (_db, ...segments) => ({ path: segments.join("/") }),
        transactionRunner: (_db, work) => work(transaction),
      }),
    };
  }

  it("claims an unassigned incident and records who did it", async () => {
    const { repository, writes, events } = repositoryOver({
      incidentStatus: "new",
      assignedResponderIds: [],
    });

    await repository.claimIncident({
      incidentId: "report-1",
      responderId: "responder-5",
      actorRole: "responder",
    });

    expect(writes[0].assignedResponderIds).toEqual(["responder-5"]);
    expect(writes[0].incidentStatus).toBe("acknowledged");
    expect(events[0].actorId).toBe("responder-5");
    expect(events[0].fromStatus).toBe("new");
    expect(events[0].toStatus).toBe("acknowledged");
  });

  it("rejects a second responder instead of overwriting the first", async () => {
    const { repository, writes } = repositoryOver({
      incidentStatus: "acknowledged",
      assignedResponderIds: ["responder-5"],
    });

    await expect(
      repository.claimIncident({
        incidentId: "report-1",
        responderId: "responder-6",
        actorRole: "responder",
      }),
    ).rejects.toBeInstanceOf(AlreadyClaimedError);

    expect(writes).toHaveLength(0);
  });

  it("lets the assigned responder act again without error", async () => {
    const { repository, writes } = repositoryOver({
      incidentStatus: "acknowledged",
      assignedResponderIds: ["responder-5"],
    });

    await repository.claimIncident({
      incidentId: "report-1",
      responderId: "responder-5",
      actorRole: "responder",
    });

    expect(writes).toHaveLength(1);
  });

  it("refuses to claim an incident that no longer exists", async () => {
    const { repository } = repositoryOver(null);

    await expect(
      repository.claimIncident({
        incidentId: "gone",
        responderId: "responder-5",
        actorRole: "responder",
      }),
    ).rejects.toBeInstanceOf(TransitionError);
  });
});

describe("transitioning an incident", () => {
  function repositoryOver(stored) {
    const writes = [];
    const events = [];

    const transaction = {
      get: async () => ({ exists: () => true, data: () => stored }),
      update: (_ref, data) => writes.push(data),
      set: (_ref, data) => events.push(data),
    };

    return {
      writes,
      events,
      repository: createIncidentRepository({
        db: {},
        documentRef: (_db, ...segments) => ({ path: segments.join("/") }),
        transactionRunner: (_db, work) => work(transaction),
      }),
    };
  }

  it("re-checks the stored status, not the one the screen showed", async () => {
    // The screen believed this was still acknowledged.
    const { repository, writes } = repositoryOver({
      incidentStatus: "resolved",
      assignedResponderIds: ["responder-5"],
    });

    await expect(
      repository.transitionIncident({
        incidentId: "report-1",
        toStatus: "dispatched",
        actorId: "responder-5",
        actorRole: "responder",
      }),
    ).rejects.toBeInstanceOf(TransitionError);

    expect(writes).toHaveLength(0);
  });

  it("writes the audit event alongside a valid transition", async () => {
    const { repository, writes, events } = repositoryOver({
      incidentStatus: "dispatched",
      assignedResponderIds: ["responder-5"],
    });

    await repository.transitionIncident({
      incidentId: "report-1",
      toStatus: "resolved",
      actorId: "responder-5",
      actorRole: "responder",
      note: "Family moved to the covered court.",
    });

    expect(writes[0].incidentStatus).toBe("resolved");
    expect(writes[0].resolvedAt).toBeDefined();
    expect(events[0].note).toBe("Family moved to the covered court.");
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
