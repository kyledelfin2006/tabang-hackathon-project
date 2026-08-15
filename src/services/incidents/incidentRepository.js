import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase.js";
import {
  INCIDENT_STATUS,
  buildTransitionEvent,
  describeTransitionRejection,
  toIncident,
} from "./incidentLifecycle.js";

const REPORTS_COLLECTION = "reports";
const EVENTS_SUBCOLLECTION = "events";

export const INCIDENT_PAGE_SIZE = 25;

const OPEN_STATUSES = Object.freeze([
  INCIDENT_STATUS.new,
  INCIDENT_STATUS.acknowledged,
  INCIDENT_STATUS.dispatched,
  INCIDENT_STATUS.onScene,
]);

/**
 * Describes the incident queue query without touching Firestore.
 *
 * Kept pure so the filters and the page cap can be asserted directly.
 */
export function buildIncidentQuerySpec({
  status = "open",
  kind = "all",
  pageSize = INCIDENT_PAGE_SIZE,
} = {}) {
  return Object.freeze({
    statuses: Object.freeze(
      status === "open" ? [...OPEN_STATUSES] : [status],
    ),
    kind: kind === "all" ? null : kind,
    orderBy: Object.freeze([
      Object.freeze(["createdAt", "asc"]),
      Object.freeze(["__name__", "asc"]),
    ]),
    limit: Math.min(Math.max(1, pageSize), INCIDENT_PAGE_SIZE),
  });
}

export class TransitionError extends Error {}
export class AlreadyClaimedError extends Error {}

export function createIncidentRepository({
  db,
  documentRef = doc,
  collectionRef = collection,
  runQuery = getDocs,
  transactionRunner = runTransaction,
  queryBuilder = (database, spec) =>
    query(
      collectionRef(database, REPORTS_COLLECTION),
      where("incidentStatus", "in", spec.statuses),
      ...(spec.kind ? [where("kind", "==", spec.kind)] : []),
      ...spec.orderBy.map(([field, direction]) => orderBy(field, direction)),
      limit(spec.limit),
    ),
  now = () => Date.now(),
} = {}) {
  return {
    async listIncidents(options = {}) {
      const database = db ?? getFirebaseDb();
      const spec = buildIncidentQuerySpec(options);
      const snapshot = await runQuery(queryBuilder(database, spec));
      const clock = now();

      return snapshot.docs.map((document) =>
        toIncident(document.id, document.data(), clock),
      );
    },

    /**
     * Claims an incident for one responder.
     *
     * The read and the write happen in the same transaction, so two responders
     * pressing claim at the same moment cannot both succeed: the second sees
     * the first responder's id and is rejected rather than silently replacing
     * them. Silent overwrites are how two teams end up believing the other one
     * went.
     */
    async claimIncident({ incidentId, responderId, actorRole }) {
      const database = db ?? getFirebaseDb();
      const incidentRef = documentRef(
        database,
        REPORTS_COLLECTION,
        incidentId,
      );

      await transactionRunner(database, async (transaction) => {
        const snapshot = await transaction.get(incidentRef);

        if (!snapshot.exists()) {
          throw new TransitionError("That incident no longer exists.");
        }

        const data = snapshot.data();
        const assigned = Array.isArray(data.assignedResponderIds)
          ? data.assignedResponderIds
          : [];

        if (assigned.length > 0 && !assigned.includes(responderId)) {
          throw new AlreadyClaimedError(
            "Another responder has already claimed this incident.",
          );
        }

        const rejection = describeTransitionRejection(
          data.incidentStatus,
          INCIDENT_STATUS.acknowledged,
        );

        if (assigned.length === 0 && rejection) {
          throw new TransitionError(rejection);
        }

        transaction.update(incidentRef, {
          assignedResponderIds: [responderId],
          incidentStatus: INCIDENT_STATUS.acknowledged,
          acknowledgedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        transaction.set(
          documentRef(
            database,
            REPORTS_COLLECTION,
            incidentId,
            EVENTS_SUBCOLLECTION,
            `${Date.now()}-${responderId}`,
          ),
          {
            ...buildTransitionEvent({
              fromStatus: data.incidentStatus,
              toStatus: INCIDENT_STATUS.acknowledged,
              actorId: responderId,
              actorRole,
              note: "Claimed and acknowledged.",
            }),
            createdAt: serverTimestamp(),
          },
        );
      });
    },

    /**
     * Advances an incident and appends the matching audit event.
     *
     * The transition is re-checked against the stored status inside the
     * transaction, so a stale screen cannot push an incident through a step it
     * has already passed.
     */
    async transitionIncident({
      incidentId,
      toStatus,
      actorId,
      actorRole,
      note,
    }) {
      const database = db ?? getFirebaseDb();
      const incidentRef = documentRef(
        database,
        REPORTS_COLLECTION,
        incidentId,
      );

      await transactionRunner(database, async (transaction) => {
        const snapshot = await transaction.get(incidentRef);

        if (!snapshot.exists()) {
          throw new TransitionError("That incident no longer exists.");
        }

        const data = snapshot.data();
        const rejection = describeTransitionRejection(
          data.incidentStatus,
          toStatus,
        );

        if (rejection) {
          throw new TransitionError(rejection);
        }

        transaction.update(incidentRef, {
          incidentStatus: toStatus,
          updatedAt: serverTimestamp(),
          ...(toStatus === INCIDENT_STATUS.resolved
            ? { resolvedAt: serverTimestamp() }
            : {}),
        });

        transaction.set(
          documentRef(
            database,
            REPORTS_COLLECTION,
            incidentId,
            EVENTS_SUBCOLLECTION,
            `${Date.now()}-${actorId}`,
          ),
          {
            ...buildTransitionEvent({
              fromStatus: data.incidentStatus,
              toStatus,
              actorId,
              actorRole,
              note,
            }),
            createdAt: serverTimestamp(),
          },
        );
      });
    },
  };
}
