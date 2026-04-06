import { Hono } from "hono";
import type { PersonaRegistry } from "../persona/registry.js";
import type { KnowledgeGraph } from "../knowledge/graph.js";
import {
  generateAndSavePersona,
  type GeneratePersonaRequest,
} from "../persona/generator.js";

export function personasRoute(
  registry: PersonaRegistry,
  graph: KnowledgeGraph
): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({
      personas: registry.list(),
      total: registry.list().length,
    });
  });

  app.get("/:id", (c) => {
    const persona = registry.get(c.req.param("id"));
    if (!persona) {
      return c.json({ error: "Persona not found" }, 404);
    }
    return c.json({
      id: persona.id,
      name: persona.name,
      role: persona.role,
      avatar: persona.avatar,
      backstory: persona.backstory,
      expertise: persona.expertise,
      style: persona.style,
      pain_point_affinity: persona.pain_point_affinity,
    });
  });

  // Generate a new persona from pain points
  app.post("/generate", async (c) => {
    const body = await c.req.json<GeneratePersonaRequest>();

    if (!body.pain_points || body.pain_points.length === 0) {
      return c.json({ error: "pain_points (array) required" }, 400);
    }

    try {
      const profile = await generateAndSavePersona(body, graph);

      // Reload registry to include the new persona
      registry.reload();

      return c.json({
        message: `New persona "${profile.name}" created!`,
        persona: {
          id: profile.id,
          name: profile.name,
          role: profile.role,
          avatar: profile.avatar,
          backstory: profile.backstory,
          style: profile.style,
          pain_point_affinity: profile.pain_point_affinity,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: `Failed to generate persona: ${message}` }, 500);
    }
  });

  return app;
}
