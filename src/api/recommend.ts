import { Hono } from "hono";
import type { KnowledgeGraph } from "../knowledge/graph.js";
import type { PersonaRegistry } from "../persona/registry.js";

export function recommendRoute(
  graph: KnowledgeGraph,
  registry: PersonaRegistry
): Hono {
  const app = new Hono();

  // Quick recommendation without LLM - pure KG-based
  app.post("/", async (c) => {
    const body = await c.req.json<{
      message?: string;
      pain_points?: string[];
    }>();

    if (!body.message && !body.pain_points) {
      return c.json(
        { error: "message or pain_points required" },
        400
      );
    }

    let queryResult;
    if (body.pain_points && body.pain_points.length > 0) {
      queryResult = graph.queryByPainPoints(body.pain_points);
    } else {
      queryResult = graph.queryByMessage(body.message!);
    }

    // Find best persona for these concerns
    const painPointIds = queryResult.painPoints.map((pp) => pp.id);
    const bestPersonas = registry.findBestForPainPoints(painPointIds);

    return c.json({
      detected_concerns: queryResult.painPoints.map((pp) => ({
        id: pp.id,
        name: pp.name,
      })),
      recommended_ingredients: queryResult.ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        mechanism: ing.mechanism,
        safety: ing.safety_rating,
      })),
      recommended_products: queryResult.products.map((prod) => ({
        id: prod.id,
        name: prod.name,
        description: prod.description,
        hero: prod.hero_product,
        tagline: prod.tagline,
      })),
      suggested_personas: bestPersonas.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        role: p.role,
        why: `${p.pain_point_affinity
          .filter((a) => painPointIds.includes(a))
          .join(", ")} 고민에 전문`,
      })),
    });
  });

  return app;
}
