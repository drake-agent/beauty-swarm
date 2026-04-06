import { Hono } from "hono";
import { generateApiKey, listApiKeys } from "../middleware/auth.js";
import { createUser } from "../db/users.js";
import { getUsageStats, getRecentLogs } from "../monitoring/usage.js";

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

    // Create user + api key
    const apiKey = generateApiKey(body.label);
    const user = createUser(apiKey, body.name);

    // Link api key to user
    const { getDb } = await import("../db/schema.js");
    getDb().run("UPDATE api_keys SET user_id = ? WHERE key = ?", [user.id, apiKey]);

    return c.json({
      api_key: apiKey,
      user_id: user.id,
      label: body.label,
      message: "Save this API key — it won't be shown again",
    });
  });

  // List API keys
  app.get("/api-keys", (c) => {
    const keys = listApiKeys();
    return c.json({
      keys: keys.map((k) => ({
        ...k,
        key: `${k.key.slice(0, 8)}...${k.key.slice(-4)}`, // mask
      })),
    });
  });

  // Usage stats
  app.get("/usage", (c) => {
    const since = c.req.query("since");
    const until = c.req.query("until");
    const apiKey = c.req.query("api_key");
    const stats = getUsageStats({ api_key: apiKey, since: since, until: until });
    return c.json(stats);
  });

  // Recent logs
  app.get("/logs", (c) => {
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const logs = getRecentLogs(limit);
    return c.json({ logs });
  });

  return app;
}
