import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://localhost:5432/beauty_swarm";

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected PG pool error:", err.message);
    });
  }
  return pool;
}

export async function initSchema(): Promise<void> {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL,
      line TEXT NOT NULL,
      category TEXT NOT NULL,
      routine_step TEXT NOT NULL,
      description TEXT NOT NULL,
      key_ingredients JSONB NOT NULL DEFAULT '[]',
      addresses JSONB NOT NULL DEFAULT '[]',
      skin_type_fit JSONB NOT NULL DEFAULT '[]',
      price_krw INTEGER,
      price_range TEXT NOT NULL,
      size_ml INTEGER NOT NULL,
      hero_product BOOLEAN NOT NULL DEFAULT FALSE,
      tagline TEXT NOT NULL,
      in_stock BOOLEAN NOT NULL DEFAULT TRUE,
      url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      api_key TEXT UNIQUE NOT NULL,
      name TEXT,
      skin_type TEXT,
      age_group TEXT,
      concerns JSONB NOT NULL DEFAULT '[]',
      allergies JSONB NOT NULL DEFAULT '[]',
      preferences JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      label TEXT NOT NULL,
      permissions JSONB NOT NULL DEFAULT '["chat","panel","recommend"]',
      rate_limit_per_min INTEGER NOT NULL DEFAULT 30,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id SERIAL PRIMARY KEY,
      api_key TEXT,
      endpoint TEXT NOT NULL,
      persona_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL DEFAULT 200,
      error TEXT,
      guardrail_mode TEXT,
      guardrail_level TEXT,
      intent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Idempotent column adds for existing deploys
  await p.query(`ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS guardrail_mode TEXT`);
  await p.query(`ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS guardrail_level TEXT`);
  await p.query(`ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS intent TEXT`);

  // [SEC-3] API key hashing columns. `key_hash` is the sha256 lookup index;
  // `key_prefix` is a display-safe fragment (e.g. "bpc_abc12345") for admin UIs.
  // We keep the old `key` column temporarily for backfill + backward compat.
  await p.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT`);
  await p.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT`);
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE key_hash IS NOT NULL`);

  // Backfill: hash any plaintext keys that lack a hash yet.
  const { rows: legacyKeys } = await p.query<{ key: string }>(
    `SELECT key FROM api_keys WHERE key_hash IS NULL AND key IS NOT NULL`
  );
  if (legacyKeys.length > 0) {
    const { createHash } = await import("node:crypto");
    for (const r of legacyKeys) {
      const hash = createHash("sha256").update(r.key).digest("hex");
      const prefix = r.key.slice(0, 12);
      await p.query(
        `UPDATE api_keys SET key_hash = $1, key_prefix = $2 WHERE key = $3`,
        [hash, prefix, r.key]
      );
    }
    console.log(`🔐 Backfilled ${legacyKeys.length} API key hash(es)`);
  }

  // Indexes
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_logs(api_key)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON usage_logs(endpoint)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_guardrail ON usage_logs(guardrail_mode)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_addresses ON products USING GIN(addresses)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_ingredients ON products USING GIN(key_ingredients)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_skin_type ON products USING GIN(skin_type_fit)`);
}

// [SEC-3] Compute the hash used for api_key lookups. Keep this in one place
// so auth middleware and key generator agree.
export function hashApiKey(key: string): string {
  // Bun exposes Node's crypto API synchronously; this is called on every request.
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(key).digest("hex");
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
