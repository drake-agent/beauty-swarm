import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(
  import.meta.dir ?? new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "data",
  "beauty-swarm.db"
);

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const { mkdirSync } = require("fs");
    mkdirSync(join(DB_PATH, ".."), { recursive: true });
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL,
      line TEXT NOT NULL,
      category TEXT NOT NULL,
      routine_step TEXT NOT NULL,
      description TEXT NOT NULL,
      key_ingredients TEXT NOT NULL,  -- JSON array
      addresses TEXT NOT NULL,        -- JSON array
      skin_type_fit TEXT NOT NULL,    -- JSON array
      price_krw INTEGER,
      price_range TEXT NOT NULL,
      size_ml INTEGER NOT NULL,
      hero_product INTEGER NOT NULL DEFAULT 0,
      tagline TEXT NOT NULL,
      in_stock INTEGER NOT NULL DEFAULT 1,
      url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      api_key TEXT UNIQUE NOT NULL,
      name TEXT,
      skin_type TEXT,
      age_group TEXT,
      concerns TEXT,            -- JSON array
      allergies TEXT,           -- JSON array
      preferences TEXT,         -- JSON object
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      user_id TEXT,
      label TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '["chat","panel","recommend"]',  -- JSON array
      rate_limit_per_min INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT,
      endpoint TEXT NOT NULL,
      persona_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL DEFAULT 200,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (api_key) REFERENCES api_keys(key)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_logs(api_key)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON usage_logs(endpoint)
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
