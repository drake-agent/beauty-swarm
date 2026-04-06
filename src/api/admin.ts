import { Hono } from "hono";
import { generateApiKey, listApiKeys } from "../middleware/auth.js";
import { createUser } from "../db/users.js";
import { getUsageStats, getRecentLogs } from "../monitoring/usage.js";
import { getPool } from "../db/schema.js";

export function adminRoute(adminKey: string): Hono {
  const app = new Hono();

  // Admin auth check
  app.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
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

    // Link api key to user
    await getPool().query(
      "UPDATE api_keys SET user_id = $1 WHERE key = $2",
      [user.id, apiKey]
    );

    return c.json({
      api_key: apiKey,
      user_id: user.id,
      label: body.label,
      message: "Save this API key — it won't be shown again",
    });
  });

  // List API keys
  app.get("/api-keys", async (c) => {
    const keys = await listApiKeys();
    return c.json({
      keys: keys.map((k) => ({
        ...k,
        key: `${k.key.slice(0, 8)}...${k.key.slice(-4)}`,
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
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const logs = await getRecentLogs(limit);
    return c.json({ logs });
  });

  return app;
}
