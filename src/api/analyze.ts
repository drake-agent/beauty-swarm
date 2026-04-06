import { Hono } from "hono";
import {
  analyzeSkinImage,
  analyzeSkinImageFromUrl,
} from "../chat/image-analyzer.js";
import type { KnowledgeGraph } from "../knowledge/graph.js";
import type { PersonaRegistry } from "../persona/registry.js";
import { logUsage } from "../monitoring/usage.js";

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BASE64_LENGTH = 10 * 1024 * 1024; // ~7.5MB decoded

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Block internal/private networks
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return false;
    if (parsed.hostname.startsWith("10.")) return false;
    if (parsed.hostname.startsWith("172.")) return false;
    if (parsed.hostname.startsWith("192.168.")) return false;
    if (parsed.hostname.endsWith(".internal")) return false;
    if (parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

export function analyzeRoute(
  graph: KnowledgeGraph,
  registry: PersonaRegistry
): Hono {
  const app = new Hono();

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

    // Validate image_url (SSRF prevention)
    if (body.image_url && !isAllowedUrl(body.image_url)) {
      return c.json({ error: "Invalid image URL. Only public HTTPS URLs allowed." }, 400);
    }

    // Validate media_type
    if (body.media_type && !ALLOWED_MEDIA_TYPES.has(body.media_type)) {
      return c.json({ error: `Invalid media_type. Allowed: ${[...ALLOWED_MEDIA_TYPES].join(", ")}` }, 400);
    }

    // Validate base64 size
    if (body.image_base64 && body.image_base64.length > MAX_BASE64_LENGTH) {
      return c.json({ error: `Image too large. Max ~7.5MB.` }, 413);
    }

    try {
      let analysis;
      if (body.image_url) {
        analysis = await analyzeSkinImageFromUrl(body.image_url);
      } else {
        const mediaType = (body.media_type || "image/jpeg") as
          "image/jpeg" | "image/png" | "image/webp" | "image/gif";
        analysis = await analyzeSkinImage(body.image_base64!, mediaType);
      }

      const queryResult = graph.queryByPainPoints(analysis.detected_concerns);
      const bestPersonas = registry
        .findBestForPainPoints(analysis.detected_concerns)
        .slice(0, 3);

      logUsage({
        api_key: apiKey,
        endpoint: "POST /analyze",
        input_tokens: 1500,
        output_tokens: 200,
        latency_ms: Date.now() - start,
        status_code: 200,
      });

      return c.json({
        analysis,
        recommendations: {
          products: queryResult.products.slice(0, 5).map((p) => ({
            id: p.id, name: p.name, tagline: p.tagline,
          })),
          ingredients: queryResult.ingredients.slice(0, 5).map((i) => ({
            id: i.id, name: i.name, mechanism: i.mechanism,
          })),
        },
        suggested_personas: bestPersonas.map((p) => ({
          id: p.id, name: p.name, avatar: p.avatar,
        })),
        disclaimer: "AI 기반 분석이며 의학적 진단이 아닙니다. 정확한 진단은 피부과 전문의와 상담하세요.",
      });
    } catch (err) {
      logUsage({
        api_key: apiKey,
        endpoint: "POST /analyze",
        input_tokens: 0, output_tokens: 0,
        latency_ms: Date.now() - start,
        status_code: 500,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return c.json({ error: "Image analysis failed" }, 500);
    }
  });

  return app;
}
