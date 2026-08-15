export const INCIDENT_STATUS = Object.freeze({
  new: "new",
  acknowledged: "acknowledged",
  dispatched: "dispatched",
  onScene: "on_scene",
  resolved: "resolved",
  cancelled: "cancelled",
});

/**
 * The only transitions a responder may perform.
 *
 * Terminal states have no outgoing transitions: a resolved incident must not
 * quietly reopen, because the resident has already been told it was handled.
 * Cancellation is a resident action and is deliberately absent here.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [INCIDENT_STATUS.new]: Object.freeze([INCIDENT_STATUS.acknowledged]),
  [INCIDENT_STATUS.acknowledged]: Object.freeze([
    INCIDENT_STATUS.dispatched,
    INCIDENT_STATUS.resolved,
  ]),
  [INCIDENT_STATUS.dispatched]: Object.freeze([
    INCIDENT_STATUS.onScene,
    INCIDENT_STATUS.resolved,
  ]),
  [INCIDENT_STATUS.onScene]: Object.freeze([INCIDENT_STATUS.resolved]),
  [INCIDENT_STATUS.resolved]: Object.freeze([]),
  [INCIDENT_STATUS.cancelled]: Object.freeze([]),
});

// A responder is expected to acknowledge within this window.
export const ACKNOWLEDGEMENT_TARGET_MS = 15 * 60 * 1000;

export function allowedNextStatuses(currentStatus) {
  return ALLOWED_TRANSITIONS[currentStatus] ?? [];
}

export function canTransition(fromStatus, toStatus) {
  return allowedNextStatuses(fromStatus).includes(toStatus);
}

export function describeTransitionRejection(fromStatus, toStatus) {
  if (!Object.values(INCIDENT_STATUS).includes(toStatus)) {
    return `${toStatus} is not an incident status.`;
  }

  if (fromStatus === toStatus) {
    return "That incident is already in this status.";
  }

  if (
    fromStatus === INCIDENT_STATUS.resolved ||
    fromStatus === INCIDENT_STATUS.cancelled
  ) {
    return "This incident is closed and cannot be reopened.";
  }

  return canTransition(fromStatus, toStatus)
    ? null
    : `An incident cannot go from ${fromStatus} to ${toStatus}.`;
}

/**
 * True when an unacknowledged incident has passed the acknowledgement target.
 *
 * Evaluated against a caller-supplied clock so it can be computed at fetch
 * time and stay out of render.
 */
export function isOverdue(incident, now = Date.now()) {
  return (
    incident.incidentStatus === INCIDENT_STATUS.new &&
    incident.createdAtMillis !== null &&
    now - incident.createdAtMillis > ACKNOWLEDGEMENT_TARGET_MS
  );
}

export function elapsedSince(millis, now = Date.now()) {
  if (!millis) {
    return null;
  }

  const minutes = Math.max(0, Math.round((now - millis) / 60_000));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  return hours < 24 ? `${hours} hr ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
}

/**
 * The responder-facing view of an incident.
 *
 * Responders handling an incident need the precise location and the contact
 * number. They are never given the reporter's other profile fields or any
 * identity evidence, so this projection lists exactly what the workspace uses.
 */
export function toIncident(id, raw = {}, now = Date.now()) {
  const createdAtMillis =
    typeof raw.createdAt?.toMillis === "function"
      ? raw.createdAt.toMillis()
      : null;
  const acknowledgedAtMillis =
    typeof raw.acknowledgedAt?.toMillis === "function"
      ? raw.acknowledgedAt.toMillis()
      : null;

  const incident = {
    id,
    kind: raw.kind === "help" ? "help" : "flood",
    incidentStatus: raw.incidentStatus ?? INCIDENT_STATUS.new,
    verificationStatus: raw.verificationStatus ?? "pending",
    priority: raw.priority ?? "medium",
    publicLocationLabel: raw.publicLocationLabel ?? "",
    description: raw.description ?? "",
    contactPhone: raw.contactPhone ?? "",
    preciseLocation: raw.preciseLocation ?? null,
    severity: raw.severity ?? null,
    need: raw.need ?? null,
    peopleAffected: raw.peopleAffected ?? null,
    assignedResponderIds: Array.isArray(raw.assignedResponderIds)
      ? raw.assignedResponderIds
      : [],
    createdAtMillis,
    acknowledgedAtMillis,
  };

  return Object.freeze({
    ...incident,
    isOverdue: isOverdue(incident, now),
    waitingFor: elapsedSince(createdAtMillis, now),
    isClaimed: incident.assignedResponderIds.length > 0,
  });
}

/**
 * Builds the append-only audit event for a transition.
 *
 * The actor is taken from the verified session rather than from anything the
 * caller passes in, and the rules require it to match the writing account, so
 * an event cannot be attributed to somebody else.
 */
export function buildTransitionEvent({
  fromStatus,
  toStatus,
  actorId,
  actorRole,
  note,
}) {
  return {
    type: "status-change",
    fromStatus,
    toStatus,
    actorId,
    actorRole,
    note: (note ?? "").trim().slice(0, 500),
  };
}
