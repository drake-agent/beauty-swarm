import type { Context, Next } from "hono";
import { getPool } from "../db/schema.js";

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "Missing or invalid Authorization header. Use: Bearer <api_key>" },
      401
    );
  }

  const apiKey = authHeader.slice(7);
  const pool = getPool();

  const { rows } = await pool.query(
    "SELECT * FROM api_keys WHERE key = $1 AND is_active = TRUE",
    [apiKey]
  );

  if (rows.length === 0) {
    return c.json({ error: "Invalid or inactive API key" }, 401);
  }

  const keyRow = rows[0];

  // Update last used (fire-and-forget)
  pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE key = $1", [apiKey])
    .catch(() => {}); // non-critical

  // Attach to context
  c.set("apiKey", apiKey);
  c.set("apiKeyRow", keyRow);
  c.set("userId", keyRow.user_id);

  await next();
}

// Generate a new API key
export async function generateApiKey(label: string, userId?: string): Promise<string> {
  const pool = getPool();
  const key = `bpc_${crypto.randomUUID().replace(/-/g, "")}`;

  await pool.query(
    `INSERT INTO api_keys (key, user_id, label) VALUES ($1, $2, $3)`,
    [key, userId || null, label]
  );

  return key;
}

// List API keys
export async function listApiKeys(): Promise<
  Array<{ key: string; label: string; user_id: string | null; is_active: boolean; last_used_at: string | null }>
> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT key, label, user_id, is_active, last_used_at FROM api_keys"
  );
  return rows;
}
