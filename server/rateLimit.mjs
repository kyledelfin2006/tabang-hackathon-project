/**
 * An in-memory token bucket per key (a client id or an IP address).
 *
 * Each bucket holds `limitPerMinute` tokens and refills continuously. One
 * server instance is the expected scale; a second instance would keep its own
 * buckets, which is acceptable at this size and recorded as an assumption in
 * the architecture.
 */
export function createRateLimiter({ limitPerMinute, now = () => Date.now() }) {
  const buckets = new Map();
  const refillPerMs = limitPerMinute / 60_000;

  return {
    take(key) {
      const time = now();
      const bucket = buckets.get(key) ?? { tokens: limitPerMinute, at: time };
      const tokens = Math.min(
        limitPerMinute,
        bucket.tokens + (time - bucket.at) * refillPerMs,
      );

      if (tokens < 1) {
        buckets.set(key, { tokens, at: time });

        return false;
      }

      buckets.set(key, { tokens: tokens - 1, at: time });

      return true;
    },
  };
}
