import { Hono } from "hono";
import {
  analyzeSkinImage,
  analyzeSkinImageFromUrl,
} from "../chat/image-analyzer.js";
import type { KnowledgeGraph } from "../knowledge/graph.js";
import type { PersonaRegistry } from "../persona/registry.js";
import { logUsage } from "../monitoring/usage.js";

export function analyzeRoute(
  graph: KnowledgeGraph,
  registry: PersonaRegistry
): Hono {
  const app = new Hono();

  // Analyze skin image (base64)
  app.post("/", async (c) => {
    const start = Date.now();
    const apiKey = c.get("apiKey") as string;

    const body = await c.req.json<{
      image_base64?: string;
      image_url?: string;
      media_type?: string;
    }>();

    if (!body.image_base64 && !body.image_url) {
      return c.json({ error: "image_base64 or image_url required" }, 400);
    }

    try {
      let analysis;
      if (body.image_url) {
        analysis = await analyzeSkinImageFromUrl(body.image_url);
      } else {
        const mediaType = (body.media_type || "image/jpeg") as any;
        analysis = await analyzeSkinImage(body.image_base64!, mediaType);
      }

      // Enrich with KG recommendations
      const queryResult = graph.queryByPainPoints(analysis.detected_concerns);
      const bestPersonas = registry
        .findBestForPainPoints(analysis.detected_concerns)
        .slice(0, 3);

      logUsage({
        api_key: apiKey,
        endpoint: "POST /analyze",
        input_tokens: 1500, // estimate for image
        output_tokens: 200,
        latency_ms: Date.now() - start,
        status_code: 200,
      });

      return c.json({
        analysis,
        recommendations: {
          products: queryResult.products.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name,
            tagline: p.tagline,
          })),
          ingredients: queryResult.ingredients.slice(0, 5).map((i) => ({
            id: i.id,
            name: i.name,
            mechanism: i.mechanism,
          })),
        },
        suggested_personas: bestPersonas.map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
        })),
        disclaimer:
          "AI 기반 분석이며 의학적 진단이 아닙니다. 정확한 진단은 피부과 전문의와 상담하세요.",
      });
    } catch (err) {
      logUsage({
        api_key: apiKey,
        endpoint: "POST /analyze",
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
        status_code: 500,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return c.json({ error: "Image analysis failed" }, 500);
    }
  });

  return app;
}
