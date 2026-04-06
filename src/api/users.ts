import { Hono } from "hono";
import { getUserByApiKey, updateUserProfile } from "../db/users.js";

export function usersRoute(): Hono {
  const app = new Hono();

  // Get current user profile
  app.get("/me", async (c) => {
    const apiKey = c.get("apiKey") as string;
    const user = await getUserByApiKey(apiKey);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json(user);
  });

  // Update current user profile
  app.patch("/me", async (c) => {
    const apiKey = c.get("apiKey") as string;
    const user = await getUserByApiKey(apiKey);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const body = await c.req.json<{
      name?: string;
      skin_type?: string;
      age_group?: string;
      concerns?: string[];
      allergies?: string[];
      preferences?: Record<string, unknown>;
    }>();

    const updated = await updateUserProfile(user.id, body);
    return c.json(updated);
  });

  return app;
}
