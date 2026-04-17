import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { generateApiKey, listApiKeys } from "../middleware/auth.js";
import { createUser } from "../db/users.js";
import { getUsageStats, getRecentLogs } from "../monitoring/usage.js";
import { getPool } from "../db/schema.js";

// [SEC-2] Constant-time string compare — prevents byte-by-byte timing leak
// that standard `!==` would allow on the admin key.
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function adminRoute(adminKey: string): Hono {
  const app = new Hono();
  const expected = `Bearer ${adminKey}`;

  app.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization") || "";
    if (!constantTimeEqual(authHeader, expected)) {
      return c.json({ error: "Admin access required" }, 403);
    }
    await next();
  });

  // Generate new API key
  app.post("/api-keys", async (c) => {
    const body = await c.req.json<{ label: string; name?: string }>();
    if (!body.label) {
      return c.json({ error: "label required" }, 400);
    }

    const apiKey = await generateApiKey(body.label);
    const user = await createUser(apiKey, body.name);

    // Link api key to user (by hash-linked row we just inserted)
    await getPool().query(
      "UPDATE api_keys SET user_id = $1 WHERE key_prefix = $2",
      [user.id, apiKey.slice(0, 12)]
    );

    return c.json({
      api_key: apiKey,
      user_id: user.id,
      label: body.label,
      message: "Save this API key — it won't be shown again",
    });
  });

  // List API keys (no plaintext — prefix only)
  app.get("/api-keys", async (c) => {
    const keys = await listApiKeys();
    return c.json({
      keys: keys.map((k) => ({
        ...k,
        key: `${k.key_prefix}...`,
      })),
    });
  });

  // Usage stats
  app.get("/usage", async (c) => {
    const since = c.req.query("since");
    const until = c.req.query("until");
    const apiKey = c.req.query("api_key");
    const stats = await getUsageStats({
      api_key: apiKey,
      since: since,
      until: until,
    });
    return c.json(stats);
  });

  // Recent logs
  app.get("/logs", async (c) => {
    // [BUG-10] Guard against NaN / negative / huge limits.
    const raw = Number(c.req.query("limit"));
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 500) : 50;
    const logs = await getRecentLogs(limit);
    // [SEC-12] Mask api_key in responses — never echo full keys to admin UIs.
    const masked = logs.map((l) => ({
      ...l,
      api_key: l.api_key ? `${l.api_key.slice(0, 12)}...` : null,
    }));
    return c.json({ logs: masked });
  });

  return app;
}
