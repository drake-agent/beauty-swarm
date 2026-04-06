import { Hono } from "hono";
import type { PanelEngine, PanelRequest } from "../chat/panel-engine.js";
import { logUsage } from "../monitoring/usage.js";

export function panelRoute(engine: PanelEngine): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const start = Date.now();
    const apiKey = c.get("apiKey") as string | undefined;
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

      logUsage({
        api_key: apiKey || null,
        endpoint: "POST /panel",
        persona_id: body.persona_ids.join(","),
        input_tokens: response.usage.total_input_tokens,
        output_tokens: response.usage.total_output_tokens,
        latency_ms: Date.now() - start,
        status_code: 200,
      });

      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      logUsage({
        api_key: apiKey || null,
        endpoint: "POST /panel",
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
        status_code: 400,
        error: message,
      });

      return c.json({ error: message }, 400);
    }
  });

  return app;
}
