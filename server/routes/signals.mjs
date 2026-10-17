import { ApiError } from "../http.mjs";
import {
  ContractPendingError,
  toCanonicalSignal,
} from "../integrations/dostSignal.mjs";
import {
  describeErrors,
  validateCanonicalSignal,
} from "../signals/canonicalSignal.mjs";

const SIGNAL_BODY_BYTES = 64 * 1024;

export const signalRoutes = [
  {
    method: "POST",
    path: "/api/v1/signals",
    scope: "signals:write",
    maxBodyBytes: SIGNAL_BODY_BYTES,
    // Idempotent by source and externalId: resending a signal updates it and
    // its advisory instead of publishing a second one.
    async handler({ body, store }) {
      const { value, errors } = validateCanonicalSignal(body);

      if (errors) {
        throw new ApiError(400, "invalid_request", describeErrors(errors));
      }

      const { signalId, created } = await store.ingestSignal(value);

      return {
        status: created ? 201 : 200,
        body: { data: { id: signalId, created } },
      };
    },
  },
  {
    method: "POST",
    path: "/api/v1/integrations/dost-signal",
    scope: "signals:write",
    maxBodyBytes: SIGNAL_BODY_BYTES,
    async handler({ body }) {
      try {
        toCanonicalSignal(body);
      } catch (error) {
        if (error instanceof ContractPendingError) {
          throw new ApiError(
            501,
            "not_implemented",
            "The DOST Signal contract is pending. Send canonical signals to /api/v1/signals.",
          );
        }

        throw error;
      }

      throw new ApiError(
        501,
        "not_implemented",
        "The DOST Signal adapter is not finished.",
      );
    },
  },
];
