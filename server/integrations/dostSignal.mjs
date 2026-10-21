/**
 * The DOST Signal adapter seam (REQ-036).
 *
 * DOST's payload shape, transport, and request signing are not known yet
 * (decision D-1, question Q-2). Both functions are the place that knowledge
 * will go; until then they refuse explicitly rather than guessing, and the
 * route answers 501. Partners who can send the canonical signal today use
 * POST /api/v1/signals instead.
 */
export class ContractPendingError extends Error {
  constructor() {
    super("The DOST Signal contract is pending; this adapter cannot map payloads yet.");
    this.code = "contract_pending";
  }
}

/** Will take a DOST payload and return the canonical signal. */
export function toCanonicalSignal() {
  throw new ContractPendingError();
}

/** Will take (headers, rawBody, secret) and check the request signature. */
export function verifyRequest() {
  throw new ContractPendingError();
}
