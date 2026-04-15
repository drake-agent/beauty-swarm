import { Hono } from "hono";
import type { ChatEngine, ChatRequest } from "../chat/engine.js";
import { logUsage } from "../monitoring/usage.js";
import { isValidGuardrailMode } from "../chat/guardrails.js";

const MAX_MESSAGE_LENGTH = 5000;

export function chatRoute(engine: ChatEngine): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const start = Date.now();
    const apiKey = c.get("apiKey") as string | undefined;
    const body = await c.req.json<ChatRequest>();

    if (!body.persona_id || !body.message) {
      return c.json({ error: "persona_id and message are required" }, 400);
    }

    // [m7] Message length validation
    if (body.message.length > MAX_MESSAGE_LENGTH) {
      return c.json({ error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` }, 400);
    }

    // Guardrail mode validation (optional override for A/B testing)
    if (body.guardrail_mode !== undefined && !isValidGuardrailMode(body.guardrail_mode)) {
      return c.json({ error: "guardrail_mode must be 'trust', 'brand', or 'hybrid'" }, 400);
    }

    try {
      const response = await engine.chat(body, apiKey);

      logUsage({
        api_key: apiKey || null,
        endpoint: "POST /chat",
        persona_id: response.persona.id,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        latency_ms: Date.now() - start,
        status_code: 200,
        guardrail_mode: response.guardrail.mode,
        guardrail_level: response.guardrail.level,
        intent: response.intent,
      });

      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      logUsage({
        api_key: apiKey || null,
        endpoint: "POST /chat",
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
