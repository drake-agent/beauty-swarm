import { Hono } from "hono";
import { cors } from "hono/cors";
import { KnowledgeGraph } from "./knowledge/graph.js";
import { PersonaRegistry } from "./persona/registry.js";
import { ChatEngine } from "./chat/engine.js";
import { PanelEngine } from "./chat/panel-engine.js";
import { chatRoute } from "./api/chat.js";
import { panelRoute } from "./api/panel.js";
import { recommendRoute } from "./api/recommend.js";
import { analyzeRoute } from "./api/analyze.js";
import { usersRoute } from "./api/users.js";
import { personasRoute } from "./api/personas.js";
import { adminRoute } from "./api/admin.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { initSchema } from "./db/schema.js";
import { seedProducts } from "./db/products.js";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const app = new Hono();
app.use("*", cors());

// Core services (sync — no DB needed)
const graph = new KnowledgeGraph();
const registry = new PersonaRegistry();
const chatEngine = new ChatEngine(graph, registry);
const panelEngine = new PanelEngine(graph, registry);
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY environment variable is required");
  process.exit(1);
}

// =====================
// PUBLIC
// =====================

app.get("/", (c) =>
  c.json({
    name: "beauty-swarm",
    version: "0.3.0",
    disclaimer: "AI-powered service. All personas are AI characters.",
    db: "PostgreSQL",
    endpoints: {
      public: ["GET /", "GET /personas", "GET /personas/:id", "GET /pain-points"],
      authenticated: ["POST /chat", "POST /panel", "POST /recommend", "POST /analyze", "POST /personas/generate", "GET /users/me", "PATCH /users/me"],
      admin: ["POST /admin/api-keys", "GET /admin/api-keys", "GET /admin/usage", "GET /admin/logs"],
    },
  })
);

app.get("/personas", (c) =>
  c.json({ personas: registry.list(), total: registry.list().length })
);

app.get("/personas/:id", (c) => {
  const p = registry.get(c.req.param("id"));
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json({
    id: p.id, name: p.name, role: p.role, avatar: p.avatar,
    backstory: p.backstory, expertise: p.expertise, style: p.style,
    pain_point_affinity: p.pain_point_affinity,
  });
});

app.get("/pain-points", (c) =>
  c.json({
    categories: graph.getAllPainPoints().map((pp) => ({
      id: pp.id, name: pp.name, description: pp.description,
      variants: pp.variants.map((v) => ({ id: v.id, label: v.label })),
    })),
  })
);

// =====================
// AUTHENTICATED
// =====================

app.use("/chat", authMiddleware, rateLimitMiddleware);
app.use("/panel", authMiddleware, rateLimitMiddleware);
app.use("/recommend", authMiddleware, rateLimitMiddleware);
app.use("/analyze", authMiddleware, rateLimitMiddleware);
app.use("/personas/generate", authMiddleware, rateLimitMiddleware);
app.use("/users/*", authMiddleware, rateLimitMiddleware);

app.route("/chat", chatRoute(chatEngine));
app.route("/panel", panelRoute(panelEngine));
app.route("/recommend", recommendRoute(graph, registry));
app.route("/analyze", analyzeRoute(graph, registry));
app.route("/users", usersRoute());

const personaRouter = personasRoute(registry, graph);
app.post("/personas/generate", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/generate";
  return personaRouter.fetch(
    new Request(url.toString(), { method: c.req.method, headers: c.req.raw.headers, body: c.req.raw.body })
  );
});

// =====================
// ADMIN
// =====================
app.route("/admin", adminRoute(ADMIN_KEY));

// =====================
// Bootstrap
// =====================

async function bootstrap(): Promise<void> {
  // Init PostgreSQL schema
  await initSchema();
  console.log("✅ PostgreSQL schema initialized");

  // Seed products from YAML
  try {
    const dataDir = join(import.meta.dir ?? ".", "data");
    const raw = parse(readFileSync(join(dataDir, "products.yaml"), "utf-8"));
    await seedProducts(
      raw.products.map((p: any) => ({
        ...p,
        price_krw: p.price_krw || null,
        hero_product: p.hero_product || false,
        in_stock: true,
        url: p.url || null,
      }))
    );
    console.log(`✅ Seeded ${raw.products.length} products`);
  } catch (err) {
    console.warn("⚠️ Could not seed products:", (err as Error).message);
  }
}

// Run bootstrap then start server
const PORT = parseInt(process.env.PORT || "3000", 10);

bootstrap().then(() => {
  console.log(`🧴 beauty-swarm v0.3.0 → http://localhost:${PORT}`);
  console.log(`📋 ${registry.list().length} personas | 🧬 ${graph.getAllPainPoints().length} concerns | 🏷️ ${graph.getAllProducts().length} products`);
  console.log(`🐘 PostgreSQL | 🔐 Auth required | 👑 Admin key configured`);
}).catch((err) => {
  console.error("❌ Bootstrap failed:", err.message);
  console.error("   Make sure DATABASE_URL is set or PostgreSQL is running on localhost:5432/beauty_swarm");
  process.exit(1);
});

export default { port: PORT, fetch: app.fetch };
