import { Hono } from "hono";
import { cors } from "hono/cors";
import { KnowledgeGraph } from "./knowledge/graph.js";
import { PersonaRegistry } from "./persona/registry.js";
import { ChatEngine } from "./chat/engine.js";
import { PanelEngine } from "./chat/panel-engine.js";
import { personasRoute } from "./api/personas.js";
import { chatRoute } from "./api/chat.js";
import { panelRoute } from "./api/panel.js";
import { recommendRoute } from "./api/recommend.js";

const app = new Hono();

// Middleware
app.use("*", cors());

// Initialize core services
const graph = new KnowledgeGraph();
const registry = new PersonaRegistry();
const chatEngine = new ChatEngine(graph, registry);
const panelEngine = new PanelEngine(graph, registry);

// Health check
app.get("/", (c) => {
  return c.json({
    name: "banila-persona-chat",
    version: "0.1.0",
    description: "Banilaco Multi-Persona AI Cosmetics Recommendation Chatbot",
    disclaimer: "This is an AI-powered service. All personas are AI characters, not real people.",
    endpoints: {
      "GET /personas": "List all available personas",
      "GET /personas/:id": "Get persona details",
      "POST /chat": "1:1 chat with a persona",
      "POST /panel": "Multi-persona panel discussion",
      "POST /recommend": "Quick KG-based recommendation (no LLM)",
      "POST /personas/generate": "Generate a new consumer persona from pain points (LLM)",
      "GET /pain-points": "List all pain point categories",
    },
  });
});

// Pain points listing
app.get("/pain-points", (c) => {
  const painPoints = graph.getAllPainPoints();
  return c.json({
    categories: painPoints.map((pp) => ({
      id: pp.id,
      name: pp.name,
      description: pp.description,
      variants: pp.variants.map((v) => ({ id: v.id, label: v.label })),
    })),
  });
});

// Routes
app.route("/personas", personasRoute(registry, graph));
app.route("/chat", chatRoute(chatEngine));
app.route("/panel", panelRoute(panelEngine));
app.route("/recommend", recommendRoute(graph, registry));

// Start server
const PORT = parseInt(process.env.PORT || "3000", 10);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🧴 Banila Persona Chat API running on http://localhost:${PORT}`);
console.log(`📋 ${registry.list().length} personas loaded`);
console.log(`🧬 ${graph.getAllPainPoints().length} pain point categories`);
console.log(`🏷️  ${graph.getAllProducts().length} products in catalog`);
