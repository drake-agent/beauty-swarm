// Persona routes are now handled directly in index.ts
// This file is kept for the public GET routes only

import { Hono } from "hono";
import type { PersonaRegistry } from "../persona/registry.js";

export function personasRoute(registry: PersonaRegistry): Hono {
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

  return app;
}
