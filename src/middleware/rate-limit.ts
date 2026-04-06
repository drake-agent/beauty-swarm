import type { Context, Next } from "hono";

interface RateBucket {
  count: number;
  resetAt: number;
}

interface ApiKeyRow {
  rate_limit_per_min: number;
}

const buckets = new Map<string, RateBucket>();

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  const apiKey = c.get("apiKey") as string | undefined;
  const keyRow = c.get("apiKeyRow") as ApiKeyRow | undefined;

  if (!apiKey) {
    await next();
    return;
  }

  const limit = keyRow?.rate_limit_per_min ?? 30;
  const now = Date.now();
  const windowMs = 60 * 1000;

  let bucket = buckets.get(apiKey);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(apiKey, bucket);
  }

  // [M2] Check limit BEFORE incrementing
  if (bucket.count >= limit) {
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    return c.json(
      {
        error: "Rate limit exceeded",
        limit,
        retry_after_seconds: Math.ceil((bucket.resetAt - now) / 1000),
      },
      429
    );
  }

  bucket.count++;

  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(limit - bucket.count));
  c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  await next();
}
