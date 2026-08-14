export const ROLES = Object.freeze({
  resident: "resident",
  responder: "responder",
  reviewer: "reviewer",
  admin: "admin",
});

const RESPONDER_ROLES = Object.freeze([
  ROLES.responder,
  ROLES.reviewer,
  ROLES.admin,
]);

const REVIEWER_ROLES = Object.freeze([ROLES.reviewer, ROLES.admin]);

export function normalizeRole(rawRole) {
  return Object.prototype.hasOwnProperty.call(ROLES, rawRole)
    ? ROLES[rawRole]
    : ROLES.resident;
}

export function isResponderRole(role) {
  return RESPONDER_ROLES.includes(normalizeRole(role));
}

export function isReviewerRole(role) {
  return REVIEWER_ROLES.includes(normalizeRole(role));
}

export function homeRouteForRole(role) {
  return isResponderRole(role) ? "/responder" : "/app";
}
