import { Hono } from "hono";
import type { PanelEngine, PanelRequest } from "../chat/panel-engine.js";

export function panelRoute(engine: PanelEngine): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json<PanelRequest>();

    if (
      !body.persona_ids ||
      !Array.isArray(body.persona_ids) ||
      !body.message
    ) {
      return c.json(
        { error: "persona_ids (array) and message are required" },
        400
      );
    }

    try {
      const response = await engine.discuss(body);
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
