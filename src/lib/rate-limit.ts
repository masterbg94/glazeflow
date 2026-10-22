/**
 * Fixed-window rate limiter.
 *
 * State lives in the process memory, so the limit is per instance. That is
 * enough for a single Node server and for development; behind more than one
 * instance every instance keeps its own counter, so the effective limit
 * multiplies by the instance count. A shared store (Redis, Upstash) replaces
 * this module without changing the call sites.
 *
 * The module must stay free of Node-only APIs: it is imported by the
 * middleware, which runs on the Edge runtime.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so a long-running process cannot grow without bound. */
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. Zero when the request was allowed. */
  retryAfterSeconds: number;
}

/**
 * Count one request against `key` and report whether it is allowed.
 * The window is fixed: the first request opens it, the window resets
 * `windowMs` later.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, limit, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Forget the counter for a key — used after a successful login. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Read the current counter without incrementing it. */
export function rateLimitCount(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count;
}

/**
 * The client address. `x-forwarded-for` is set by the proxy in front of the
 * app; the first entry is the original caller. `x-real-ip` and the socket
 * address are the fallbacks.
 */
export function getClientIp(headers: Headers | Record<string, unknown> | undefined): string {
  const read = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const value = (headers as Record<string, unknown>)[name];
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
    return typeof value === 'string' ? value : undefined;
  };
  const forwarded = read('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = read('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
