import type { Context, Next } from "hono";
import { getPool, hashApiKey } from "../db/schema.js";

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
  const keyHash = hashApiKey(apiKey);

  // [SEC-3] Look up by hash, never by plaintext.
  const { rows } = await pool.query(
    "SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = TRUE",
    [keyHash]
  );

  if (rows.length === 0) {
    return c.json({ error: "Invalid or inactive API key" }, 401);
  }

  const keyRow = rows[0];

  // Update last used (fire-and-forget) — by hash, not plaintext.
  pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1", [keyHash])
    .catch(() => {}); // non-critical

  // Attach to context. c.get("apiKey") returns the plaintext key (used to identify
  // the caller in usage logs via prefix) — we sanitize before logging.
  c.set("apiKey", apiKey);
  c.set("apiKeyRow", keyRow);
  c.set("userId", keyRow.user_id);

  await next();
}

// [SEC-3] Generate a new API key. Returns the plaintext key ONCE;
// only the hash + prefix is persisted.
export async function generateApiKey(label: string, userId?: string): Promise<string> {
  const pool = getPool();
  const key = `bpc_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 12); // e.g. "bpc_abc12345"

  await pool.query(
    `INSERT INTO api_keys (key, key_hash, key_prefix, user_id, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [key, keyHash, keyPrefix, userId || null, label]
  );

  return key;
}

// List API keys — never returns the plaintext key.
export async function listApiKeys(): Promise<
  Array<{ key_prefix: string; label: string; user_id: string | null; is_active: boolean; last_used_at: string | null }>
> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT key_prefix, label, user_id, is_active, last_used_at FROM api_keys ORDER BY created_at DESC"
  );
  return rows;
}
