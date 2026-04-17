import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { generateApiKey, listApiKeys } from "../middleware/auth.js";
import { createUser } from "../db/users.js";
import { getUsageStats, getRecentLogs } from "../monitoring/usage.js";
import { getPool } from "../db/schema.js";
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProductById,
  getProductHistory,
  getRecentAudit,
  getAllProductsIncludingOutOfStock,
  type ProductRow,
  type ProductPatch,
} from "../db/products.js";
import type { KnowledgeGraph } from "../knowledge/graph.js";

// [SEC-2] Constant-time string compare — prevents byte-by-byte timing leak
// that standard `!==` would allow on the admin key.
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function adminRoute(adminKey: string, graph: KnowledgeGraph): Hono {
  const app = new Hono();
  const expected = `Bearer ${adminKey}`;

  app.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization") || "";
    if (!constantTimeEqual(authHeader, expected)) {
      return c.json({ error: "Admin access required" }, 403);
    }
    await next();
  });

  // =====================================================================
  // API keys
  // =====================================================================

  app.post("/api-keys", async (c) => {
    const body = await c.req.json<{ label: string; name?: string }>();
    if (!body.label) {
      return c.json({ error: "label required" }, 400);
    }

    const apiKey = await generateApiKey(body.label);
    const user = await createUser(apiKey, body.name);

    await getPool().query(
      "UPDATE api_keys SET user_id = $1 WHERE key_prefix = $2",
      [user.id, apiKey.slice(0, 12)]
    );

    return c.json({
      api_key: apiKey,
      user_id: user.id,
      label: body.label,
      message: "Save this API key — it won't be shown again",
    });
  });

  app.get("/api-keys", async (c) => {
    const keys = await listApiKeys();
    return c.json({
      keys: keys.map((k) => ({ ...k, key: `${k.key_prefix}...` })),
    });
  });

  // =====================================================================
  // Usage
  // =====================================================================

  app.get("/usage", async (c) => {
    const since = c.req.query("since");
    const until = c.req.query("until");
    const apiKey = c.req.query("api_key");
    const stats = await getUsageStats({ api_key: apiKey, since, until });
    return c.json(stats);
  });

  app.get("/logs", async (c) => {
    const raw = Number(c.req.query("limit"));
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 500) : 50;
    const logs = await getRecentLogs(limit);
    const masked = logs.map((l) => ({
      ...l,
      api_key: l.api_key ? `${l.api_key.slice(0, 12)}...` : null,
    }));
    return c.json({ logs: masked });
  });

  // =====================================================================
  // Products CRUD + audit (ARCH-2)
  // =====================================================================

  // List all products, including out-of-stock (admin view).
  app.get("/products", async (c) => {
    const products = await getAllProductsIncludingOutOfStock();
    return c.json({ products, total: products.length });
  });

  app.get("/products/:id", async (c) => {
    const product = await getProductById(c.req.param("id"));
    if (!product) return c.json({ error: "Not found" }, 404);
    return c.json(product);
  });

  // Required fields for creation.
  const REQUIRED_FIELDS: Array<keyof ProductRow> = [
    "id", "name", "name_en", "line", "category", "routine_step", "description",
    "key_ingredients", "addresses", "skin_type_fit", "price_range", "size_ml",
    "hero_product", "tagline", "in_stock",
  ];

  app.post("/products", async (c) => {
    const body = await c.req.json<Partial<ProductRow>>();
    for (const f of REQUIRED_FIELDS) {
      if (body[f] === undefined) {
        return c.json({ error: `missing required field: ${f}` }, 400);
      }
    }
    try {
      const created = await createProduct(body as ProductRow);
      // Propagate to the in-memory graph immediately instead of waiting for
      // the 60s refresh cycle.
      await graph.refreshProducts();
      return c.json({ product: created }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Typical case: duplicate primary key.
      if (msg.includes("duplicate key")) {
        return c.json({ error: `product with id already exists` }, 409);
      }
      return c.json({ error: msg }, 400);
    }
  });

  app.patch("/products/:id", async (c) => {
    const id = c.req.param("id");
    const patch = await c.req.json<ProductPatch>();

    // Reject attempts to change the id.
    if ("id" in patch) {
      return c.json({ error: "id is immutable" }, 400);
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "empty patch" }, 400);
    }

    try {
      const updated = await updateProduct(id, patch);
      if (!updated) return c.json({ error: "Not found" }, 404);
      await graph.refreshProducts();
      return c.json({ product: updated });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
    }
  });

  // Soft delete — flips in_stock=FALSE. Row preserved for audit.
  app.delete("/products/:id", async (c) => {
    const id = c.req.param("id");
    const result = await softDeleteProduct(id);
    if (!result) return c.json({ error: "Not found" }, 404);
    await graph.refreshProducts();
    return c.json({ product: result, deleted: "soft" });
  });

  // Audit history for a specific product.
  app.get("/products/:id/history", async (c) => {
    const history = await getProductHistory(c.req.param("id"));
    return c.json({ history });
  });

  // Recent audit entries across all products.
  app.get("/products-audit", async (c) => {
    const raw = Number(c.req.query("limit"));
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 500) : 50;
    const audit = await getRecentAudit(limit);
    return c.json({ audit });
  });

  // Force-refresh the in-memory product cache from PG (bypasses 60s cadence).
  app.post("/products/refresh", async (c) => {
    await graph.refreshProducts();
    return c.json({ refreshed: true, count: graph.getAllProducts().length });
  });

  return app;
}
