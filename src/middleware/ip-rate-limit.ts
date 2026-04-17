// [SEC-1] IP-based rate limit for unauthenticated endpoints (/compose).
//
// This is a best-effort in-process limiter — it does NOT survive restart
// and does NOT sync across instances. For production behind a reverse proxy
// that sets X-Forwarded-For, the first IP in the chain is used.

import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup stale buckets every 5 minutes.
const cleanupHandle = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}, 5 * 60 * 1000);
// Don't block process exit on the interval.
if (typeof cleanupHandle === "object" && cleanupHandle && "unref" in cleanupHandle) {
  (cleanupHandle as { unref: () => void }).unref();
}

function extractIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  // Bun/Hono: fall back to a stable placeholder — better than nothing.
  return "unknown";
}

export function ipRateLimit(opts: { perMin: number }): (c: Context, next: Next) => Promise<Response | void> {
  const { perMin } = opts;
  const windowMs = 60_000;

  return async (c, next) => {
    const ip = extractIp(c);
    const now = Date.now();

    let bucket = buckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }

    if (bucket.count >= perMin) {
      c.header("X-RateLimit-Limit", String(perMin));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
      return c.json(
        { error: "Rate limit exceeded (IP)", retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000) },
        429
      );
    }

    bucket.count++;
    c.header("X-RateLimit-Limit", String(perMin));
    c.header("X-RateLimit-Remaining", String(perMin - bucket.count));
    c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    await next();
  };
}
