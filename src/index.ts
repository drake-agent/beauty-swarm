import "./types/hono-env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { KnowledgeGraph } from "./knowledge/graph.js";
import { PersonaRegistry } from "./persona/registry.js";
import { ChatEngine } from "./chat/engine.js";
import { PanelEngine } from "./chat/panel-engine.js";
import { chatRoute } from "./api/chat.js";
import { panelRoute } from "./api/panel.js";
import { recommendRoute } from "./api/recommend.js";
import { analyzeRoute } from "./api/analyze.js";
import { usersRoute } from "./api/users.js";
import { adminRoute } from "./api/admin.js";
import { personasRoute } from "./api/personas.js";
import { composeRoute } from "./api/compose.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { ipRateLimit } from "./middleware/ip-rate-limit.js";
import { initSchema } from "./db/schema.js";
import { seedProducts } from "./db/products.js";
import {
  generateAndSavePersona,
  type GeneratePersonaRequest,
} from "./persona/generator.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";

// [m10] Reliable __dirname equivalent
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

// [M3] CORS — restrict to known origins (allow all in dev)
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? ["*"];
app.use("*", cors({
  origin: ALLOWED_ORIGINS.includes("*")
    ? "*"
    // [SEC-9] Return no header for disallowed origins, not a false-positive allow
    : (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
}));

// [SEC-6] Per-route body size limits. The 15MB cap exists only for /analyze
// (image upload). Other endpoints use small caps so an unauthenticated
// attacker can't OOM the process with giant JSON bodies.
app.use("/analyze", bodyLimit({ maxSize: 15 * 1024 * 1024 }));
app.use("/compose", bodyLimit({ maxSize: 64 * 1024 }));
app.use("/chat", bodyLimit({ maxSize: 64 * 1024 }));
app.use("/panel", bodyLimit({ maxSize: 64 * 1024 }));
app.use("/recommend", bodyLimit({ maxSize: 16 * 1024 }));
app.use("/admin/*", bodyLimit({ maxSize: 16 * 1024 }));
app.use("/users/*", bodyLimit({ maxSize: 16 * 1024 }));

// Core services
const graph = new KnowledgeGraph();
const registry = new PersonaRegistry();
const chatEngine = new ChatEngine(graph, registry);
const panelEngine = new PanelEngine(graph, registry);

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY environment variable is required");
  process.exit(1);
}
// [CFG-2] Fail fast if Anthropic key absent — otherwise first /chat request fails
// with an unhelpful 500 instead of a clear boot error.
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}
// [BUG-12] Minimum length guard on admin key (32 chars) — prevents weak keys.
if (ADMIN_KEY.length < 32) {
  console.error("❌ ADMIN_KEY must be at least 32 characters (use a secure random string)");
  process.exit(1);
}

// =====================
// PUBLIC
// =====================

app.get("/", (c) =>
  c.json({
    name: "beauty-swarm",
    version: "0.4.0",
    disclaimer: "AI-powered service. All personas are AI characters.",
    db: "PostgreSQL",
  })
);

app.get("/personas", (c) =>
  c.json({ personas: registry.list(), total: registry.list().length })
);

// [ui] Serve the compose UI page (no auth — page itself is public; POST /compose still requires key)
app.get("/ui", (c) => {
  try {
    const html = readFileSync(join(__dirname, "ui", "compose.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.json({ error: "UI not found" }, 404);
  }
});

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
// [SEC-1] /compose is intentionally unauthenticated (human-in-the-loop UI for
// personal/local use). Defensive layers: HOST=127.0.0.1 by default, IP rate
// limit, and a smaller per-route body cap (see above). Operators who expose
// this publicly should put additional controls in front of it.
app.use("/compose", ipRateLimit({ perMin: 10 }));
app.use("/personas/generate", authMiddleware, rateLimitMiddleware);
app.use("/users/*", authMiddleware, rateLimitMiddleware);

app.route("/chat", chatRoute(chatEngine));
app.route("/panel", panelRoute(panelEngine));
app.route("/recommend", recommendRoute(graph, registry));
app.route("/analyze", analyzeRoute(graph, registry));
app.route("/compose", composeRoute(chatEngine, registry));
app.route("/users", usersRoute());

// [m3] Direct persona generate handler — no sub-router forwarding hack
app.post("/personas/generate", async (c) => {
  const body = await c.req.json<GeneratePersonaRequest>();

  if (!body.pain_points || body.pain_points.length === 0) {
    return c.json({ error: "pain_points (array) required" }, 400);
  }

  try {
    const profile = await generateAndSavePersona(body, graph);
    registry.reload();

    return c.json({
      message: `New persona "${profile.name}" created!`,
      persona: {
        id: profile.id, name: profile.name, role: profile.role,
        avatar: profile.avatar, backstory: profile.backstory,
        pain_point_affinity: profile.pain_point_affinity,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to generate persona: ${message}` }, 500);
  }
});

// =====================
// ADMIN
// =====================
app.route("/admin", adminRoute(ADMIN_KEY));

// =====================
// Bootstrap
// =====================

async function bootstrap(): Promise<void> {
  await initSchema();
  console.log("✅ PostgreSQL schema initialized");

  try {
    const dataDir = join(__dirname, "data");
    const raw = parse(readFileSync(join(dataDir, "products.yaml"), "utf-8"));
    await seedProducts(
      raw.products.map((p: Record<string, unknown>) => ({
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

const PORT = parseInt(process.env.PORT || "3000", 10);
// [CFG-11] Default to localhost. Operators must explicitly set HOST=0.0.0.0
// to expose the server publicly — /compose is intentionally unauthenticated
// and should not be reachable from the internet without explicit opt-in.
const HOST = process.env.HOST || "127.0.0.1";

bootstrap().then(() => {
  console.log(`🧴 beauty-swarm v0.4.0 → http://${HOST}:${PORT}`);
  console.log(`📋 ${registry.list().length} personas | 🧬 ${graph.getAllPainPoints().length} concerns | 🏷️ ${graph.getAllProducts().length} products`);
  console.log(`🐘 PostgreSQL | 🔐 Auth required | 👑 Admin key configured`);
  if (HOST !== "0.0.0.0" && HOST !== "127.0.0.1") return;
  if (HOST === "0.0.0.0") {
    console.warn("⚠️  Binding to 0.0.0.0 — /compose is unauthenticated. Ensure reverse proxy + rate limit in front.");
  }
}).catch((err) => {
  console.error("❌ Bootstrap failed:", err.message);
  process.exit(1);
});

export default { port: PORT, hostname: HOST, fetch: app.fetch };
