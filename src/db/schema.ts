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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_logs(api_key)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON usage_logs(endpoint)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_addresses ON products USING GIN(addresses)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_ingredients ON products USING GIN(key_ingredients)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_products_skin_type ON products USING GIN(skin_type_fit)`);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
