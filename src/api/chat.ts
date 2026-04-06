import { Hono } from "hono";
import type { ChatEngine, ChatRequest } from "../chat/engine.js";

export function chatRoute(engine: ChatEngine): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json<ChatRequest>();

    if (!body.persona_id || !body.message) {
      return c.json(
        { error: "persona_id and message are required" },
        400
      );
    }

    try {
      const response = await engine.chat(body);
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
