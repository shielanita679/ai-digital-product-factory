import "server-only";

/**
 * Fixed-window rate limiting behind a replaceable store.
 *
 * The default MemoryRateLimitStore keeps counters inside ONE Node.js
 * process. If the host runs several processes or instances, each has its own
 * counters, so limits are per process — it is NOT distributed protection.
 * To share limits, implement RateLimitStore over a shared backend (for
 * example a table in the Crestmont MySQL database) and pass it to
 * setRateLimitStore(). Call sites don't change.
 */

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export interface RateLimitStore {
  /** Counts one hit for `key` and reports whether it is within `limit` per `windowMs`. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
      this.lastSweep = now;
    }
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    return { ok: true, retryAfterSeconds: 0 };
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return store.hit(key, limit, windowMs);
}
