import type { Context, Next } from "hono";
import { getDb } from "../db/schema.js";

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "Missing or invalid Authorization header. Use: Bearer <api_key>" },
      401
    );
  }

  const apiKey = authHeader.slice(7);
  const db = getDb();

  const keyRow = db.query(
    "SELECT * FROM api_keys WHERE key = ? AND is_active = 1"
  ).get(apiKey) as any;

  if (!keyRow) {
    return c.json({ error: "Invalid or inactive API key" }, 401);
  }

  // Update last used
  db.run("UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?", [apiKey]);

  // Attach to context
  c.set("apiKey", apiKey);
  c.set("apiKeyRow", keyRow);
  c.set("userId", keyRow.user_id);

  await next();
}

// Generate a new API key
export function generateApiKey(label: string, userId?: string): string {
  const db = getDb();
  const key = `bpc_${crypto.randomUUID().replace(/-/g, "")}`;

  db.run(
    `INSERT INTO api_keys (key, user_id, label) VALUES (?, ?, ?)`,
    [key, userId || null, label]
  );

  return key;
}

// List API keys
export function listApiKeys(): Array<{ key: string; label: string; user_id: string | null; is_active: boolean; last_used_at: string | null }> {
  const db = getDb();
  return db.query("SELECT key, label, user_id, is_active, last_used_at FROM api_keys").all() as any[];
}
